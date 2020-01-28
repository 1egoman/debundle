const fs = require('fs');
const path = require('path');

const acorn = require('acorn');
const escope = require('escope');
const estraverse = require('estraverse');
const escodegen = require('escodegen');

function parseBundleModules(node) {
  if (node.type === 'ObjectExpression') {
    // Object
    return node.properties.map(property => [property.key.value, property.value])
  } else if (node.type === 'ArrayExpression') {
    // Array
    return node.elements.map((moduleAst, moduleId) => [moduleId, moduleAst])
  } else {
    throw new Error('Cannot locate modules within bundle - it is not an array or an object!');
  }
}

class WebpackBootstrapNotFoundError extends Error {}
class WebpackBootstrapModuleCallExpressionNotFoundError extends Error {}

class WebpackBootstrap {
  constructor(ast, moduleCallExpression) {
    this.ast = ast;
    this._moduleCallExpression = moduleCallExpression;

    this.publicPath = this._getRequireFunctionProperty('p').value;
  }

  get _requireFunction() {
    let moduleCallExpression = this._moduleCallExpression;
    while (moduleCallExpression) {
      if (moduleCallExpression.type.startsWith('Function')) {
        return moduleCallExpression;
      }
      moduleCallExpression = moduleCallExpression._parent;
    }
  }

  _getRequireFunctionProperty(propertyName) {
    const requireFunctionName = this._requireFunction.id.name;

    this.scopeManager = escope.analyze(this.ast);
    const requireFunction = this.scopeManager.scopes[0].set.get(requireFunctionName);

    // Looking for an instance of soemthing like:
    // > require[propertyName] = ...
    const requireFunctionPropertyAssignment = requireFunction.references.find(reference => {
      const node = reference.identifier._parent._parent;
      return (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'MemberExpression' &&
        node.left.property.name === propertyName
      );
    })

    if (!requireFunctionPropertyAssignment) {
      return null;
    }

    const assignedValueAst = requireFunctionPropertyAssignment.identifier._parent._parent.right
    return assignedValueAst;
  }

  get entrypointModuleId() {
    return this._getRequireFunctionProperty('s').value;
  }

  // Returns an array that looks like ['module', 'exports', 'require'], which indicates
  // the index of each value in the function signature of each module closure
  get moduleClosureParamIndexes() {
    const moduleCallExpression = this._moduleCallExpression;
    const [moduleThisValue, ...args] = moduleCallExpression.arguments;

    let paramIndexes = [null, null, null];

    // First, find `exports`. It will be the only `MemberExpression` in the argument list, since
    // `module.exports` is being passed.
    const exportsIndex = args.findIndex(arg => arg.type === 'MemberExpression');
    paramIndexes[exportsIndex] = 'exports';

    // Second, find module. It can be determined because the `this` value in the `.call` above is
    // module.exports.
    const moduleName = moduleThisValue.object.name;
    const moduleIndex = args.findIndex(arg => arg.name === moduleName);
    paramIndexes[moduleIndex] = 'module';

    // Finally, require is the remaining index.
    const requireIndex = paramIndexes.findIndex(i => i === null);
    paramIndexes[requireIndex] =  'require';

    return paramIndexes;
  }
}

const DEFAULT_CHUNK = 'default';

class Bundle {
  constructor(p) {
    this.path = p;
    this.metadataFilePath = path.join(path.dirname(this.path), path.basename(this.path)+'.info');

    this.distPath = './dist';
    this.chunks = {};
    this.parse();
  }

  parse() {
    const bundleContents = fs.readFileSync(this.path);

    this.ast = acorn.parse(bundleContents, {});

    // Add `_parent` property to every node, so that the parent can be
    // determined in later code.
    estraverse.traverse(this.ast, {
      fallback: 'iteration',
      enter: function(node, parent) {
        node._parent = parent;
      },
    });

    this._findWebpackBootstrap();

    // Get a path to the location within the bundle where the module list occurs.
    // Should return a list of `FunctionExpression` ast nodes.
    const webpackBootstrapParent = this.webpackBootstrap.ast._parent;
    const bundleModules = parseBundleModules(webpackBootstrapParent.arguments[0]);
    this.addChunk(DEFAULT_CHUNK, bundleModules);

    this.moduleTree = this._calculateModuleTree();

    this.writeMetadataFile();
  }

  get modules() {
    return Object.fromEntries(
      Object.values(this.chunks)
        .flatMap(chunk => Object.entries(chunk.modules))
    );
  }

  // Given anything that could be specified in a `require` call, return the module
  getModule = (moduleId) => {
    if (typeof moduleId === 'number') {
      return this.modules[moduleId];
    } else {
      throw new Error('Need to implement looking up modules by path');
    }
  }

  getChunk = (chunkId) => {
    return this.chunks[chunkId];
  }
  get defaultChunk() { return this.getChunk(DEFAULT_CHUNK); }
  addChunk = (chunkId, bundleModules=null) => {
    const chunk = new Chunk(this, chunkId, bundleModules);
    chunk.ids.forEach(id => {
      this.chunks[id] = chunk;
    });
    return chunk;
  }

  // Get all modules that are at the top level of the bundle (probably just one, but could be
  // multiple in theory)
  get entrypointModule() {
    return this.modules[this.webpackBootstrap.entrypointModuleId];
  }

  // Find the ast that makes up the webpack bootstrap section of the bundle
  _findWebpackBootstrap() {
    if (this.webpackBootstrap) {
      return this.webpackBootstrap;
    }

    let webpackBootstrap, webpackBoostrapModuleCallNode;

    estraverse.traverse(this.ast.body, {
      fallback: 'iteration',
      enter: function(node, parent) {
        // Looking for this line, which invokes each module closure:
        // > modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
        function findRequireFunction() {
          let moduleCallNode = null;

          estraverse.traverse(node, {
            fallback: 'iteration',
            enter: function(n) {
              const isModuleCallNode = (
                n.type === 'CallExpression' &&
                n.callee.type === 'MemberExpression' &&
                n.callee.property.name === 'call' &&
                n.callee.object.type === 'MemberExpression' &&
                n.arguments.length === 4
              );

              if (isModuleCallNode) {
                moduleCallNode = n;
                this.break();
              }
            }
          });

          return moduleCallNode;
        }

        const requireFunction = findRequireFunction();

        const isWebpackBootstrap = (
          node &&
          node.type &&
          node.type.startsWith('Function') &&
          node.params.length === 1 &&
          node.body.type.startsWith('Block') &&
          requireFunction
        );

        if (isWebpackBootstrap) {
          webpackBootstrap = node;
          webpackBoostrapModuleCallNode = requireFunction;
          this.break();
        } 
      },
    });

    if (!webpackBootstrap) {
      throw new WebpackBootstrapNotFoundError(
        [
          `Unable to locate webpackBootstrap, part of a webpack bundle that orchestrates the module system.`,
          `This is a hard requirement to be able to debundle, since it contains a bunch of metadata required`,
          `for later in the process.`,
          ``,
          `To continue, you'll need to locate the path to the 'FunctionExpression' that contains webpackBootstrap,`,
          `and put this in the metadata file generated alongside your bundle (${this.metadataFilePath})`,
          '',
          `Take a look at the documentation online for more information.`,
        ].join('\n')
      )
    }

    this.webpackBootstrap = new WebpackBootstrap(webpackBootstrap, webpackBoostrapModuleCallNode);
    return this.webpackBootstrap;
  }

  // Get a path to the location within the bundle where the module list occurs.
  // Should return a list of `FunctionExpression` ast nodes.
  get moduleClosureParamIndexes() {
    return this.webpackBootstrap.moduleClosureParamIndexes;
  }

  _calculateModuleTree() {
    // Create an object mapping the module id to an object containing the module id, the parent
    // modules, and the vhild modules.
    const tree = Object.fromEntries(
      Object.values(this.modules).map(module => [module.id, {
        id: module.id,
        _dependencyIds: module._dependencyModuleIds,
        parents: [],
        children: [],
        bare: false,
      }])
    );

    // Loop through each element in the object, populating all the children and parents.
    Object.values(tree).forEach(item => {
      item.children = item._dependencyIds.flatMap(id => {
        if (!tree[id]) {
          tree[id] = { parents: [], children: [], bare: true };
        }
        const m = tree[id];
        m.parents.push(item);
        return [m];
      });
      delete item._dependencyIds;
    });

    return Object.values(tree);
  }

  serialize() {
    return {
      version: 1,
      entrypointModuleId: this.entrypointModule.id,
      modules: Object.fromEntries(
        Object.values(this.modules).map(m => [m.id, m.serialize()])
      ),
    };
  }

  writeMetadataFile() {
    const contents = this.serialize();
    fs.writeFileSync(this.metadataFilePath, JSON.stringify(contents, null, 2));
  }
}


class Chunk {
  constructor(bundle, chunkId, bundleModules) {
    this._constructorChunkId = chunkId;
    this.bundle = bundle;

    if (bundleModules) {
      // If bundleModules was already defined, assume that this chunk represents the main bundle.
      this.ids = [DEFAULT_CHUNK];
      this.ast = null;
    } else {
      // No modules were specified. We'll need to locate the bundle chunk seperately on our own.
      const chunkContents = fs.readFileSync(this.filePath);
      this.ast = acorn.parse(chunkContents, {});

      // Add `_parent` property to every node, so that the parent can be
      // determined in later code.
      estraverse.traverse(this.ast, {
        fallback: 'iteration',
        enter: function(node, parent) {
          node._parent = parent;
        },
      });

      let chunkIds, moduleList;

      estraverse.traverse(this.ast, {
        fallback: 'iteration',
        enter: function(node, parent) {
          const chunkIdArray = (
            node.type === 'ArrayExpression' &&
            node.elements.length > 0 &&
            node.elements.every(n => n.type === 'Literal') &&
            node.elements.map(n => n.value)
          );

          if (!chunkIdArray) {
            return;
          }
          const moduleListAst = (
            parent &&
            parent.arguments &&
            parent.arguments.length === 2 &&
            parent.arguments[1]
          );

          if (!moduleListAst) {
            return;
          }

          chunkIds = chunkIdArray;
          moduleList = moduleListAst;
          this.break();
        },
      });

      this.ids = chunkIds;
      bundleModules = parseBundleModules(moduleList);
    }

    this.modules = Object.fromEntries(
      bundleModules
      .flatMap(([moduleId, moduleAst]) => {
        // Sometimes, modules are null. This is usually because they are a empty / a placeholder
        // for a module that exists in a different bundle chunk / in a different javascript file.
        if (moduleAst === null) {
          return [];
        } else {
          return [
            [moduleId, new Module(this, moduleId, moduleAst)]
          ];
        }
      })
    );
  }

  get url() {
    return this.bundle.webpackBootstrap.publicPath + this._constructorChunkId + '.bundle.js';
  }

  get filePath() {
    return path.join(path.dirname(this.bundle.path), this._constructorChunkId + '.bundle.js');
  }
}




// Thrown when a require function is encountered with multiple arguments
class RequireFunctionHasMultipleArgumentsError extends Error {}



class Module {
  constructor(chunk, moduleId, ast) {
    this.chunk = chunk;
    this.bundle = this.chunk.bundle;

    this.id = moduleId;
    this.ast = ast;

    this.path = `${chunk._constructorChunkId}-${this.id}.js`;

    this.scopeManager = escope.analyze(this.ast);

    // Find all referenced to `require(...)` in the module, and figure out which modules are being
    // required
    this._dependencyModuleIds = this._findAllRequireFunctionCalls();

    // If any modules were found to be in additional chunks that were not previously known about,
    // add them.
    this._dependencyModuleIds
      .filter(({chunkId, moduleId}) => !(
        chunkId === DEFAULT_CHUNK || this.bundle.getChunk(chunkId)
      ))
      .forEach(({chunkId, moduleId}) => {
        this.bundle.addChunk(chunkId);
      });
  }

  get absolutePath() {
    return path.join(this.bundle.distPath, this.path);
  }

  // Get a reference to the require function scope in the module closure
  get requireFunctionVariable() {
    const requireFunctionIndex = this.bundle.moduleClosureParamIndexes.indexOf('require');
    const requireFunction = this.ast.params[requireFunctionIndex];
    if (!requireFunction) { return null; }

    return this.scopeManager.scopes[0].variables.find(v => v.name === requireFunction.name);
  }

  get dependencies() {
    return this._dependencyModuleIds.map(({chunkId, moduleId}) => (
      this.bundle.getChunk(chunkId).getModule(moduleId)
    ));
  }

  get code() {
    const originalAst = acorn.parse('var a = '+escodegen.generate(this.ast), {}).body[0].declarations[0].init;

    if (this.requireFunctionVariable) {
      // Adjust all require calls to contain the path to the module that is desired
      this._findAllRequireFunctionCalls().forEach(call => {
        if (!this.bundle.modules[call.moduleId]) {
          return;
        }

        const requiredModulePath = this.bundle.modules[call.moduleId].absolutePath;

        // Determine the require path that must be used to access the module requested from
        // the current module.
        call.ast.value = path.relative(
          path.dirname(this.absolutePath),
          requiredModulePath
        )
      });

      // Rename __webpack_require__ (or minified name) to require
      this.renameVariable(this.requireFunctionVariable, 'require');
    }

    const newAst = this.ast;
    this.ast = originalAst;

    return escodegen.generate(newAst);
  }

  // Rename a variable in the module to be a different name
  renameVariable(variable, newName) {
    // Rename all instances of the variabl
    variable.identifiers.forEach(ident => {
      ident.name = newName;
    })

    // Rename all other references of the variable, too
    variable.references.forEach(reference => {
      reference.identifier.name = newName;
    });
    return this;
  }

  serialize() {
    return {
      path: this.path,
    };
  }

  // Returns an array of objects of {type, chunkId, moduleId, ast}, retreived by parting the AST and
  // determining all the times that the `require` or `require.ensure` functions were invoked.
  _findAllRequireFunctionCalls() {
    const requireFunctionVariable = this.requireFunctionVariable;

    // If no require function is defined in the module, then it cannot have any dependencies
    if (!requireFunctionVariable) {
      return [];
    }

    return requireFunctionVariable.references.map(reference => {
      const requireCallExpression = reference.identifier._parent;

      // __webpack_require__(4)
      const isRequireCall = (
        requireCallExpression.type === 'CallExpression' &&
        requireCallExpression.callee.type === 'Identifier' &&
        requireCallExpression.callee.name === reference.identifier.name
      );
      if (isRequireCall) {
        const requireArguments = requireCallExpression.arguments;

        if (requireArguments.length > 1) {
          throw new RequireFunctionHasMultipleArgumentsError(
            `The require function found at ${reference.identifier.start}-${reference.identifier.end} had more than one argument - it had ${requireArguments.length} (${requireArguments.map(arg => arg.raw).join(', ')})`
          )
        }

        return {
          type: 'REQUIRE_FUNCTION',
          chunkId: this.chunk._constructorChunkId,
          moduleId: requireArguments[0].value,
          ast: requireArguments[0],
        };
      }

      // __webpack_require__.e(0).then(__webpack_require__.bind(null, 4))
      const isRequireEnsureCall = (
        // Assert Module ID is in the right location
        requireCallExpression.type === 'MemberExpression' &&
        requireCallExpression.property.name === 'bind' &&
        requireCallExpression.property.name === 'bind' &&
        requireCallExpression._parent.type === 'CallExpression' &&
        requireCallExpression._parent.arguments.length === 2 &&
        requireCallExpression._parent.arguments[1].type === 'Literal' &&

        // Assert Chunk ID is in the right location
        requireCallExpression._parent._parent.callee.property.name === 'then' &&
        requireCallExpression._parent._parent._parent.object.type === 'CallExpression' &&
        requireCallExpression._parent._parent._parent.object.callee.object.type === 'CallExpression' &&
        requireCallExpression._parent._parent._parent.object.callee.object.callee.property.name === 'e' &&
        requireCallExpression._parent._parent._parent.object.callee.object.arguments.length > 0 &&
        requireCallExpression._parent._parent._parent.object.callee.object.arguments[0].type === 'Literal'
      );

      if (isRequireEnsureCall) {
        const chunkId = requireCallExpression._parent._parent._parent.object.callee.object.arguments[0].value;
        const moduleId = requireCallExpression._parent.arguments[1].value;
        return {
          type: 'REQUIRE_ENSURE',
          chunkId,
          moduleId,
          ast: requireCallExpression._parent.arguments[1],
        };
      }

      return null;
    }).filter(i => i !== null);
  }

  get _absolutePath() {
    return path.join('/', path.normalize(this.path));
  }

  resolve(p) {
    if (!this.path) {
      throw new Error('In order to use bundle.resolve, please first define bundle.path.');
    }

    function addExtension(p) {
      if (!p.endsWith('.js')) {
        return `${p}.js`;
      } else {
        return p;
      }
    }

    if (p.startsWith('/')) {
      // Absolute path, like `/tmp/myfile.js`
      return addExtension(p);
    } else if (p.startsWith('./') || p.startsWith('../')) {
      // Relative path, like `./foo.js`
      const moduleDirName = path.dirname(this._absolutePath);
      return `.${addExtension(path.join(moduleDirName, p))}`;
    } else {
      // Node module
      let [moduleName, ...path] = p.split('/');
      if (path.length === 0) {
        path = ['index.js'];
      }
      const modulePath = `./node_modules/${moduleName}/${path}`;
      return modulePath;
    }
  }
}

// const bundle = new Bundle('test_bundles/webpack/bundle.js');
// const bundle = new Bundle('./spotify.js');
const bundle = new Bundle('./test_bundles/webpack-bundle-splitting/bundle.js');
// bundle.getModule(0).path = 'node_modules/uuid/index.js';
// bundle.getModule(5).path = 'node_modules/uuid/v1.js';
// bundle.getModule(6).path = 'node_modules/uuid/v4.js';
// // bundle.getModule(6).path = 'v4.js';
// bundle.getModule(8).path = 'index.js';
// bundle.writeMetadataFile()

// console.log(bundle.getModule(8).resolve('uuid'))

Object.values(bundle.modules).forEach(m => {
  console.log('---')
  console.log(m.id, '=>', m.path)
  console.log('---')
  console.log(m.code)
});
