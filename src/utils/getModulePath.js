const Arboreal = require('arboreal');
const MAX_RECURSION_DEPTH = 100;

function makeModuleTree(modules, moduleId, tree=new Arboreal(), depth=0) {
  let mod = modules.find(m => m.id === moduleId);
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

/* ['./foo'] => './foo'
 * ['../foo'] => '../foo'
 * ['uuid', './foo'] => 'node_modules/uuid/foo'
 * ['uuid', './foo', './bar'] => 'node_modules/uuid/bar'
 * ['uuid', './bar/foo', './baz'] => 'node_modules/uuid/bar/baz'
 * ['abc', './foo', 'uuid', './bar'] => 'node_modules/uuid/bar'
 */
const tree = makeModuleTree([
  {id: 1, code: null, lookup: {'./foo': 2, 'uuid': 3}},
  {id: 2, code: null, lookup: {'./bar/baz': 4}},
  {id: 3, code: null, lookup: {}},
  {id: 4, code: null, lookup: {'uuid': 3, '../hello': 5}},
  {id: 5, code: null, lookup: {}},
], 1 /* entry point */);

const {EventEmitter} = require('events');

function getAllPathsToModule(
  tree,
  moduleId,
  knownPaths={},

  // A stack of modules that that have been traversed in this context
  stack=[{id: tree.id, path: knownPaths[tree.id] || './index'}],
  // Eventemitter to emit the results
  emitter=new EventEmitter
) {
  // Wrap in a closure to defer execution so emitters can emit after their respective handlers have
  // already been bound.
  setImmediate(function() {
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
        emitter.emit('incomplete', newStack);
        return
      }

      // If this traversal in the module tree finally came across a node that matches what was being
      // looked for, the emit it!
      if (moduleId === child.id) {
        emitter.emit('complete', newStack);
        return
      }

      if (child.children.length > 0) {
        getAllPathsToModule(child, moduleId, knownPaths, newStack, emitter);
      } else {
        // No children to traverse into, so this stack ends in failure :/
        emitter.emit('incomplete', newStack);
        return
      }
    });
  });

  return emitter;
}

let emitter = getAllPathsToModule(tree, 4, {1: './hello/world'});
emitter.on('complete', console.log.bind(console, 'complete>'));
emitter.on('incomplete', console.log.bind(console, 'incomplete>'));

function reverseObject(obj) {
  return Object.keys(obj).reduce((acc, i) => {
    acc[obj[i]] = i; // Reverse keys and values
    return acc;
  }, {});
}


module.exports = {
  default: makeModuleTree,
  getAllPathsToModule,
};
