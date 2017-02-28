const Arboreal = require('arboreal');
const archy = require('archy');
const MAX_RECURSION_DEPTH = 100;

function makeModuleTree(modules, moduleId, tree=new Arboreal(), depth=0) {
  let mod = modules.find(m => m.id === moduleId);
  if (!mod) {
    throw new Error(`Module ${mod.id} cannot be found in the module array.`);
  }

  tree.data = mod;
  tree.id = mod.id;

  if (depth > MAX_RECURSION_DEPTH) {
    return
  }

  for (let key in mod.lookup) {
    let mm = modules.find(m => m.id === mod.lookup[key]);
    tree.appendChild(mm, mm.id);
    makeModuleTree(
      modules,
      mod.lookup[key],
      tree.children[tree.children.length - 1],
      ++depth
    );
  }

  return tree;
}

// Print a module tree. Anyt
function printModuleTree(tree, maxDepth=10) {
  function treeWalker(node, depth=0) {
    if (depth >= maxDepth) {
      return '(and more...)';
    } else if (node.children) {
      depth += 1;
      return {label: node.id.toString(), nodes: node.children.map(i => treeWalker(i, depth))};
    } else {
      // leaf node
      return node.id.toString();
    }
  }
  console.log(archy(treeWalker(tree)));
}

/* ['./foo'] => './foo'
 * ['../foo'] => '../foo'
 * ['uuid', './foo'] => 'node_modules/uuid/foo'
 * ['uuid', './foo', './bar'] => 'node_modules/uuid/bar'
 * ['uuid', './bar/foo', './baz'] => 'node_modules/uuid/bar/baz'
 * ['abc', './foo', 'uuid', './bar'] => 'node_modules/uuid/bar'
 */

function getAllPathsToModule(
  tree,
  moduleId,
  knownPaths={},

  // A stack of modules that that have been traversed in this context
  stack=[{id: tree.id, path: knownPaths[tree.id] || './index'}]
) {
  // console.trace('new node in stack', stack, tree.id);
  let completeEvents = [], incompleteEvents = [];
  // Wrap in a closure to defer execution so emitters can emit after their respective handlers have
  // already been bound.
  tree.children.forEach(child => {
    const newStack = [...stack, {
      id: child.id,
      path: knownPaths[child.id] || reverseObject(tree.data.lookup)[child.id],
    }];

    // To defeat circular imports, make sure that a module being required in hasn't already been
    // required in previously in this context. If it has, then return this stack as an incomplete
    // stack.
    let stackContainsDuplicateIds = new Set(newStack.map(i => i.id)).size !== newStack.length;
    if (stackContainsDuplicateIds) {
      console.warn(`In this current stack, ${JSON.stringify(newStack)} module ${newStack[newStack.length - 1].id} has previously been required in. Marking incomplete stack.`);
      incompleteEvents.push(newStack);
      return
    }

    // If this traversal in the module tree finally came across a node that matches what was being
    // looked for, the emit it!
    if (moduleId === child.id) {
      completeEvents.push(newStack);
      return
    }

    if (child.children.length > 0) {
      let {completeEvents: ce, incompleteEvents: ie} = getAllPathsToModule(
        child,
        moduleId,
        knownPaths,
        newStack
      );
      completeEvents = [...completeEvents, ...ce];
      incompleteEvents = [...incompleteEvents, ...ie];
    } else {
      // No children to traverse into, so this stack ends in failure :/
      incompleteEvents.push(newStack);
      return
    }
  });

  return {completeEvents, incompleteEvents};
}

function reverseObject(obj) {
  return Object.keys(obj).reduce((acc, i) => {
    acc[obj[i]] = i; // Reverse keys and values
    return acc;
  }, {});
}


module.exports = {
  default: makeModuleTree,
  getAllPathsToModule,
  printModuleTree,
};


if (require.main === module) {
  const tree = makeModuleTree([
    {id: 1, code: null, lookup: {'./foo': 2, 'uuid': 3}},
    {id: 2, code: null, lookup: {'./bar/baz': 4}},
    {id: 3, code: null, lookup: {}},
    {id: 4, code: null, lookup: {'uuid': 3, '../hello': 5}},
    {id: 5, code: null, lookup: {}},
  ], 1 /* entry point */);

  let output = getAllPathsToModule(tree, 4, {1: './hello/world'});
  output.completeEvents.forEach(i => console.log('complete>', i));
  output.incompleteEvents.forEach(i => console.log('incomplete>', i));
}
