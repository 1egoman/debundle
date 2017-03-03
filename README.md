# debundle

[![Build Status](https://travis-ci.org/1egoman/debundler.svg?branch=master)](https://travis-ci.org/1egoman/debundler)

This is a tool to decode javascript bundles produced by tools like [Webpack](https://webpack.github.io/) and [Browserify](http://browserify.org/)
into their original, pre-bunded source.

## Why would I want to debundle my code?
Reasons vary, but I originally developed this to help me with a reverse engineering project I was
working on. Needless to say, sifting through minified bundles to try and figure out how a service
works isn't fun and is a lot easier when that bundle is broken into files and those files have
semantic names. 

## Installation
```
npm i -g debundle
```

## Running
```
$ debundle
Usage: debundle [input file] {OPTIONS}

Options:
   --input,  -i  Bundle to debundle
   --output, -o  Directory to debundle code into.
   --config, -c  Configuration file

$ cat debundle-config.json
{
  "type": "webpack",
  "entryPoint": 1,
  "knownPaths": {}
}
$ debundle -i my-bundle.js -o dist/ -c debundle-config.json
$ tree dist/
dist/
├── index.js
└── node_modules
    ├── number
    │   └── index.js
    └── uuid
        ├── index.js
        ├── lib
        │   ├── bytesToUuid.js
        │   └── rng.js
        ├── v1.js
        └── v4.js
4 directories, 7 files
```

# Configuration

## Simple configuration
```
{
  "type": "webpack",
  "entryPoint": 1,
  "knownPaths": {}
}
```

(To debundle a simple Browserify bundle, replace `webpack` the above configuration with `browserify`)

## Documentation

### `type` (required)
A webpack or browserify bundle.

### `entryPoint` (required for webpack bundles)
The entry point module id. If left empty in a Browserify bundle it can often be calculated
procedurally.

### `knownPaths` (required)
An object mapping module ids to the location on disk to put a given module. For example, `{"1":
"./foo", "2": "mypackage/index", "3": "./bar/baz"}` would make this structure:
```
├── foo.js
├── bar
│   └── baz.js
└── node_modules
    └── mypackage
        └── index.js
```
  - If the path starts with `./`, it's relative to the output directory.
  - Otherwise, the path is treated as a node module, with the first path directory indicating the
    package name inside of `node_modules` and the rest of the path indicating where inside that
    module to put the file.

### `moduleAst`
Instructions to get a reference to the module ast. Only required in weird bundles where the location
of the modules AST can't be found (because it's in a different location in the bundle, for example).
This is indicated as an array of strings / numbers used to traverse through the AST data structure.

For example, `["foo", "bar", 0, "baz", 1]` would get `ast.foo.bar[0].baz[1]`.
