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
      throw new Error(`Moduel ${id} has a valid key and code, but the 2nd argument passed to the module (what is assumed to be the lookup table) isn't an object.`);
    }
    console.log(`* Extracted module lookup table for ${id}`);

    // Using the ast, create the lookup table. This maps module name to identitfier.
    // To be clear, this just converts the 2nd array arg's AST to a native javascript object.
    let lookupTable = moduleLookup.properties.reduce((acc, i) => {
      acc[i.key.value] = i.value.value;
      return acc;
    }, {});
    console.log(`* Calculated module lookup table for ${id}`);

    return {
      id,
      code: moduleFunction.body,
      lookup: lookupTable,
    };
  });
}

module.exports = browserifyDecoder;
