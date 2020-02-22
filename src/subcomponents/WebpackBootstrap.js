const escope = require('escope');

class WebpackBootstrapNotFoundError extends Error {}
class WebpackBootstrapModuleCallExpressionNotFoundError extends Error {}

class WebpackBootstrap {
  constructor(ast, moduleCallExpression) {
    this.ast = ast;
    this.scopeManager = escope.analyze(this.ast);

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

  _getRequireFunctionProperty = (propertyName) => {
    const requireFunctionName = this._requireFunction.id.name;

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
    // Most of the time, this is available within `require.s`. Check there first.
    const s = this._getRequireFunctionProperty('s');
    if (s && s.type === 'Literal') {
      return s.value;
    }

    // As a secondary step, try to look for an instance of something like this:
    // > require(require.foo = 906)

    const requireFunctionName = this._requireFunction.id.name;

    const requireFunction = this.scopeManager.scopes[0].set.get(requireFunctionName);

    const requireFunctionPropertyAssignment = requireFunction.references.find(reference => {
      const node = reference.identifier._parent._parent;
      return (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'MemberExpression' &&
        node.left.object.name === requireFunctionName &&
        node._parent.type === 'CallExpression' &&
        node._parent.callee.name === requireFunctionName
      );
    })

    if (!requireFunctionPropertyAssignment) {
      return null;
    }

    const assignedValueAst = requireFunctionPropertyAssignment.identifier._parent._parent.right;

    if (assignedValueAst && assignedValueAst.type === 'Literal') {
      return assignedValueAst.value;
    } else {
      return null;
    }
  }

  // Returns an array that looks like ['module', 'exports', 'require'], which indicates
  // the index of each value in the function signature of each module closure
  moduleClosureParamMetadata() {
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

    return {
      paramIndexes,

      // The identifier that `exports` in `module.exports` has been minified to become.
      moduleExportsKey: moduleThisValue.property.name,
    };
  }
}

module.exports = WebpackBootstrap;
