const replace = require('./extern/replace-method');
const path = require('path');
const getModuleLocation = require('./utils/getModuleLocation');

// Transform require calls to match the path of a given file.
// Here's the problem this transformation solves. Say I've got a file `foo` and a file `bar`, and
// they are in seperate directories. `foo` requires `bar`. The require path to bar in `foo` needs to
// reflect the fact that they are in different places and not necisarily in a flat directory
// structure. This transform reads require calls and adjusts the AST to point to the path to the
// module on disk.
//
// Takes an array of modules in [{id: 1, code: (ast), lookup: {}}] format, and returns the same
// format only with the ast of each module adjusted to refrence other modules properly.
//
// Also takes an optional argument `knownPaths`, which is a key value mapping where key is a module
// id and the value is the patht to that module. No `.js` needed. Ie, {1: '/path/to/my/module'}
function transformRequires(modules, knownPaths={}, entryPointModuleId, type="browserify") {
  return modules.map(mod => {
    let moduleDescriptor = mod.code.body;

    // Make sure the code is at its root a function.
    if (mod && mod.code && !(mod.code.type == 'FunctionDeclaration' || mod.code.type === 'FunctionExpression')) {
      console.warn(`* WARNING: Module ${mod.id} doesn't have a function at its root.`);
      return mod;
    }

    if (mod.code && mod.code.params && mod.code.params.length > 0) {
      // Determine the name of the require function. In unminified bundles it's `__webpack_require__`.
      let requireFunctionIdentifier = mod.code.params[type === 'webpack' ? 2 : 0];

      // Adjust the require calls to point to the files, not just the numerical module ids.
      // Unlike the below transforms, we always want this one no matter the name of the require
      // function to run since we're doning more than just changing the require functon name.
      if (requireFunctionIdentifier) {
        replace(mod.code)(
          requireFunctionIdentifier.name, // the function that require is in within the code.
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

                // If a module id is in the require, then do the require.
                if (node.arguments[0].type === 'Literal') {
                  const moduleToRequire = modules.find(i => i.id === node.arguments[0].value);

                  // FIXME:
                  // In the spotify bundle someone did a require(null)? What is that supposed to do?
                  if (!moduleToRequire) {
                    // throw new Error(`Module ${node.arguments[0].value} cannot be found, but another module (${mod.id}) requires it in.`);
                    console.warn(`Module ${node.arguments[0].value} cannot be found, but another module (${mod.id}) requires it in.`);
                    return node;
                  }

                  // Get a relative path from the current module to the module to require in.
                  let moduleLocation = path.relative(
                    // This module's path
                    path.dirname(getModuleLocation(modules, mod, knownPaths, '/', /* appendTrailingIndexFilesToNodeModules */ true, entryPointModuleId)),
                    // The module to import relative to the current module
                    getModuleLocation(modules, moduleToRequire, knownPaths, '/', /* appendTrailingIndexFilesToNodeModules */ false, entryPointModuleId)
                  );

                  // If the module path references a node_module, then remove the node_modules prefix
                  if (moduleLocation.indexOf('node_modules/') !== -1) {
                    moduleLocation = `${moduleLocation.match(/node_modules\/(.+)$/)[1]}`
                  } else if (!moduleLocation.startsWith('.')) {
                    // Make relative paths start with a ./
                    moduleLocation = `./${moduleLocation}`;
                  }

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
                } else if (node.arguments[0].type === 'Identifier') {
                  // Otherwise, just pass through the AST.
                  return {
                    type: 'CallExpression',
                    callee: {
                      type: 'Identifier',
                      name: 'require',
                    },
                    arguments: node.arguments,
                  };
                }

              case 'Identifier':
                return {
                  type: 'Identifier',
                  name: 'require',
                };
            };
          }
        );
      }

      // Also, make sure that the `module` that was injected into the closure sorrounding the module
      // wasn't mangled, and if it was, then update the closure contents to use `module` not the
      // mangled variable.
      let moduleIdentifier = mod.code.params[type === 'webpack' ? 0 : 1];
      if (moduleIdentifier && moduleIdentifier.name !== 'module') {
        console.log(`* Replacing ${moduleIdentifier.name} with 'module'...`);
        replace(mod.code)(
          moduleIdentifier.name, // the function that require is in within the code.
          node => {
            node.name = 'module';
            return node;
          }
        )
      }

      // Dito to the above for `exports`
      let exportsIdentifier = mod.code.params[type === 'webpack' ? 1 : 2];
      if (exportsIdentifier && exportsIdentifier.name !== 'exports') {
        console.log(`* Replacing ${exportsIdentifier.name} with 'exports'...`);
        replace(mod.code)(
          exportsIdentifier.name, // the function that require is in within the code.
          node => {
            node.name = 'exports';
            return node;
          }
        )
      }

    } else {
      console.log(`* Module ${mod.id} has no require param, skipping...`);
    }

    return mod;
  });
}

module.exports = transformRequires;
