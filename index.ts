/*
 *  Typedoc Webpack Plugin
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

import * as path from 'path';
import { clone, merge } from 'lodash';
import * as typedoc from 'typedoc';
import * as webpack from 'webpack';

const PluginName = 'typedoc-webpack-plugin';

const ColorReset = '\u001b[0m';
const ColorYellow = '\u001b[33m';

function isString(x: any): x is string {
    return typeof x === 'string';
}

/**
 * TypedocOptions is an Object that has either out or json.
 */
export class TypeDocOptions {
    out?: string;
    json?: string;
    [key: string]: any
}

const DefaultTypeDocOptions: TypeDocOptions = {
    out: './docs',
    module: 'commonjs',
    target: 'es5',
    exclude: '**/node_modules/**/*.*',
    experimentalDecorators: true,
    excludeExternals: true
};

// This is a workaround against that `webpack.compilation.Compilation` in @types/webpack doesn't have fileTimestamps.
interface Compilation extends webpack.compilation.Compilation {
    fileTimestamps: Map<string, number>
}

/**
 * Plugin class
 */
export class TypeDocWebpackPlugin {

    private options: TypeDocOptions;
    private readonly inputFiles: string | Array<string>;
    
    constructor(options: TypeDocOptions = DefaultTypeDocOptions, input: string | Array<string> = ['./'] ) {
        
        this.inputFiles = isString(input) ? [input] : input;
    
        // merge user options into default options and assign
        this.options = merge(DefaultTypeDocOptions, options);
    }
    
    /**
     * @param {webpack.Compiler} compiler Webpack compiler object. @see <a href="https://webpack.github.io/docs/plugins.html#the-compiler-instance">label</a>
     * @return void
     */
    apply(compiler: webpack.Compiler): void {
        
        const startTime = Date.now();
        let prevTimestamps = new Map<string, number>();
    
        // If an absolute path is set in options.out or options.json, use that
        // else if the output path is specified in webpack config, output typedocs are relative to that path
        // else output typedocs are relative to the current working directory.
        this.options = this.resolvedOptions(compiler);
        
        compiler.hooks.emit.tap(PluginName, (compilation: Compilation) => {
            
            // get list of files that have been changed
            const changedFiles = Array.from(compilation.fileTimestamps.keys()).filter((watchfile: string) => {
                return (prevTimestamps.get(watchfile) || startTime) < (compilation.fileTimestamps.get(watchfile) || Infinity);
            });
            // if changedFiles is empty, this is the first compilation so typedoc generation is required.
            const isFirstCompilation = changedFiles.length === 0;
            
            const changedTsFiles = changedFiles.filter((watchfile: string) => {
                return watchfile.indexOf('.ts') >= 1;
            });
            const tsFileEdited: boolean = changedTsFiles.length > 0;
            
            const generationRequired = isFirstCompilation || tsFileEdited;
            
            // if typescript files have been changed or we cannot determine what files have been changed run typedoc build
            if (generationRequired) {
                const typedocApp = new typedoc.Application(this.options);
                const src = typedocApp.expandInputFiles(this.inputFiles as Array<string>);
                const project = typedocApp.convert(src);
    
                // output can be either json or directory
                if (project) {
                    if (this.options.json) {
                        console.log('Generating json against');
                        console.log(src.map(file => `${ColorYellow}  ${file} ${ColorReset}`).join('\n'));
                        typedocApp.generateJson(project, this.options.json)
                    }
                    else if (this.options.out) {
                        console.log('Generating TypeDoc against');
                        console.log(src.map(file => `${ColorYellow}  ${file} ${ColorReset}`).join('\n'));
                        typedocApp.generateDocs(project, this.options.out);
                    }
                    else {
                        throw Error('Neither json nor out is specified.');
                    }
                }
            }
            else {
                console.log('No TypeScript file has been changed. Not recompiling any TypeDocs.');
            }
            
            prevTimestamps = compilation.fileTimestamps;
        });
        
    }
    
    private resolvedOptions(compiler: webpack.Compiler): TypeDocOptions {
        let ret = clone(this.options);
        const output = compiler.options.output;
        const relativeBase = (output && output.path) ? output.path : process.cwd();
        if(isString(this.options.json) && !path.isAbsolute(this.options.json) ) {
            ret.json = path.resolve(relativeBase, this.options.json);
        }
        else if (isString(this.options.out) && !path.isAbsolute(this.options.out)) {
            ret.out = path.resolve(relativeBase, this.options.out);
        }
        return ret;
    }
}
