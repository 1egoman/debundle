const replace = require('replace-method');
// Browserify decoder
// Here's an example of what a browserify bundle looks like:
//
// (function(t,n,r) { /* Broswerify require shim */ })({
//   1: [
//     function(require, module, exports) {
//       // the code goes here
//       var foo = require('./foo');
//     }, {
//       './foo': 2
//     }
//   ],
//   2: [
//     function(require, module, exports) {
//       // this the contents of foo.js
//     }, {
//       // No modules to look up
//     }
//   ],
// });
function browserifyDecoder(moduleArrayAST) {
  // Ensure that the bit of AST being passed is an object
  if (moduleArrayAST.type !== 'ObjectExpression') {
    throw new Error(`The root level IIFE didn't have an object for it's first parameter, aborting...`);
  }

  // Loop through each module
  return moduleArrayAST.properties.map(moduleDescriptor => {
    // `moduleDescriptor` is the AST for the number-to-array mapping that browserify uses to lookup
    // modules.
    if (moduleDescriptor.type !== 'Property') {
      throw new Error(`The module array AST doesn't contain a Property, make sure that the first argument passed to the rool level IIFE is an object.`);
    }

    // Extract the identifier used by the module within the bundle
    let id = moduleDescriptor.key.value;
    console.log(`* Discovered module ${id}`);

    if (moduleDescriptor.value.type !== 'ArrayExpression') {
      throw new Error(`Module ${id} has a valid key, but maps to something that isn't an array.`);
    }

    // Extract the function that wraps the module.
    let moduleFunction = moduleDescriptor.value.elements[0];
    console.log(`* Extracted module code for ${id}`);

    // Extract the lookup table for mapping module identifier to its name.
    let moduleLookup = moduleDescriptor.value.elements[1];
    if (moduleLookup.type !== 'ObjectExpression') {
      throw new Error(`Module ${id} has a valid key and code, but the 2nd argument passed to the module (what is assumed to be the lookup table) isn't an object.`);
    }
    console.log(`* Extracted module lookup table for ${id}`);

    // Using the ast, create the lookup table. This maps module name to identitfier.
    // To be clear, this just converts the 2nd array arg's AST to a native javascript object.
    let lookupTable = moduleLookup.properties.reduce((acc, i) => {
      acc[i.key.value] = i.value.value;
      return acc;
    }, {});
    console.log(`* Calculated module lookup table for ${id}`);

    // Determine the name of the require function. In unminified bundles it's `__webpack_require__`.
    let requireFunctionIdentifier = moduleFunction.params[2];

    // Replace all the `__webpack_require__`s with calls to `require`. In the process, adjust the
    // require calls to point to the files, not just the number reference.
    replace(moduleFunction)(
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

            // Otherwise, replace the module name in the require call with the module id.
            const moduleToRequireId = node.arguments[0].value;
            return {
              type: 'CallExpression',
              callee: {
                type: 'Identifier',
                name: 'require',
              },
              arguments: [
                // Substitute in the module location on disk
                {type: 'Literal', value: lookupTable[moduleToRequireId], raw: lookupTable[moduleToRequireId]},
                ...node.arguments.slice(1),
              ],
            };
        };
      }
    );

    return {
      id,
      code: moduleFunction,
      lookup: lookupTable,
    };
  });
}

module.exports = browserifyDecoder;
