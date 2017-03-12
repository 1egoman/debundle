# Configuration Documentation

Configuration is stored in a json file with an object at its root. The headings below represent the
keys in that object:

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

### `replaceRequires`
Defaults to `"inline"`. When working on a minified bundle, tell debundle how to adjust `require` 
statements to work in a node context. This is required because often minifiers will change the
identifier that require is set to in the module wrapping function to save on bytes.

Imaging this module is being debundled:
```
// ...
function (module, exports, n) {
  const myOtherModule = n(5);
  console.log(myOtherModule);
  function nestedFunction() {
    const n = 123;
  }
}
// ...
```

With `replaceRequires` set to `"inline"`, it'd look like this:
```
const myOtherModule = require(5);
console.log(myOtherModule);
function nestedFunction() {
  const require = 123;
}
```

- Is able to be rebundled by popular bundlers (browserify and webpack) and can be run in node
- Unfortunately, isn't able to handle scoping very well, and changes any coincidentally matching
symbols inside inner lexical scopes too, as can be seen above.

With `replaceRequires` set to `"variable"`, it'd look like this:
```
const n = require;
const myOtherModule = n(5);
console.log(myOtherModule);
function nestedFunction() {
  const n = 123;
}
```

- Handles scoping well - the inner scope maintains its value.
- Is able to be rebundled by *webpack* and can be run in node, but browserify chokes. Because
browserify is looking for the `require` function call when crawling your app, it isn't able to see
through the variable assignment.
- Isn't as nice to look at. `¯\_(ツ)_/¯`
