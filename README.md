# Javascript debundler

This is a project to write a parser that cann debundle browserify and webpack (and maybe more?) bundles.

Currently, it's just an experiment. But I hope to turn it into a useful tool once I've proven it
works.

## Running
```
Usage: /Users/ryan/w/1egoman/debundler/src/index.js [input file] {OPTIONS}

Options:
   --input,  -i  Bundle to debundle
   --output, -o  Directory to debundle code into.
   --config, -c  Configuration directory
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

The above is the simplest possible configuration for debundling a webpack bundle:
- `type`: self explanatory.
- `entryPoint`: The id of the entry point module in the bundle.
- `knownPaths`: An object that allows you to override where a module should be located. In most
  use-cases, it's unneeded.

(To debundle a Browserify bundle, replace `webpack` the above configuration with `browserify`)

## Documentation

### `type` (required)
A webpack or browserify bundle.

### `entryPoint` (required for webpack bundles)
The entry point module id. If left empty in a Browserify bundle it can sometimes be calculated
procedurally.

### `knownPaths` (required)
An object mapping module ids to the location on disk to put a given module. For example, `{1:
"./foo", 2: "mypackage/index", 3: './bar/baz'}` would make this structure:
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
