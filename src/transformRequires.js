const replace = require('replace-method');
const path = require('path');

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
function transformRequires(modules, knownPaths={}) {
  return modules.map(mod => {
    let moduleDescriptor = mod.code.body;

    if (mod.code && mod.code.params && mod.code.params.length >= 3) {
      // Determine the name of the require function. In unminified bundles it's `__webpack_require__`.
      let requireFunctionIdentifier = mod.code.params[2];

      // Replace all the `__webpack_require__`s with calls to `require`. In the process, adjust the
      // require calls to point to the files, not just the number reference.
      replace(mod.code)(
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

              // Given a module id, return the absolute path to the module.
              function assembleModulePath(moduleId) {
                return path.resolve(knownPaths[moduleId] || `./${moduleId}`);
              }

              // For each call, replace with a commonjs-style require call.
              // Get a relative path from the current module to the module to require in.
              const moduleToRequireId = node.arguments[0].raw;
              let moduleLocation = path.relative(
                assembleModulePath(mod.id),
                assembleModulePath(moduleToRequireId)
              );

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
    } else {
      console.log(`* Module ${mod.id} has no require param, skipping...`);
    }

    return mod;
  });
}

module.exports = transformRequires;
