const replace = require('replace-method');

// Webpack debundling shim
// Here's what a webpack bundle looks like:
//
// (function(modules) {
//   // webpack require shim is here
// })([
//   function(module, exports, __webpack_require__) {
//     var foo = __webpack_require__(2); // The index of the item to pull in within the array
//   },
//   function(module, exports, __webpack_require__) {
//     "I am foo!";
//   }
// ])
function webpackDecoder(moduleArrayAST) {

  // Ensure that the bit of AST being passed is an array
  if (moduleArrayAST.type !== 'ArrayExpression') {
    throw new Error(`The root level IIFE didn't have an array for it's first parameter, aborting...`);
  }

  return moduleArrayAST.elements.map((moduleDescriptor, id) => {
    // Determine the name of the require function. In unminified bundles it's `__webpack_require__`.
    if (moduleDescriptor.params && moduleDescriptor.params.length === 3) {
      let requireFunctionIdentifier = moduleDescriptor.params[2];

      // Replace all the `__webpack_require__`s with calls to `require`. In the process, adjust the
      // require calls to point to the files, not just the number reference.
      let updatedAst = moduleDescriptor.body;
      replace(updatedAst)(
        [requireFunctionIdentifier.name], // the function that require is in within the code.
        node => {
          switch (node.type) {
            case 'CallExpression':
              // If require is called bare (why would this ever happen? IDK), then return AST
              // without any arguments.
              if (node.arguments.length === 0) {
                return {
                  type: 'CallExpression',
                  callee: {
                    type: 'Identifier',
                    name: 'require',
                  },
                  arguments: [],
                };
              }

              // For each call, replace with a commonjs-style require call.
              // Create the require string to substitute below.
              let moduleLocation = `./${node.arguments[0].raw}`;
              return {
                type: 'CallExpression',
                callee: {
                  type: 'Identifier',
                  name: 'require',
                },
                arguments: [
                  // Substitute in the module location on disk
                  {type: 'Literal', value: moduleLocation, raw: moduleLocation},
                  ...node.arguments.slice(1),
                ],
              };
            case 'Identifier':
              return {
                type: 'Identifier',
                name: 'require',
              };
          };
        }
      );

      return {
        id,
        code: updatedAst,
      };
    } else {
      // No requires, no no AST substitutions to be done!
      console.log(`* Module ${id} doesn't have a 3 arg function surrounding it, short circuiting...`);
      return {
        id,
        code: moduleDescriptor.body,
      };
    }
  });
}

module.exports = webpackDecoder;
