const {default: makeModuleTree, getAllPathsToModule} = require('./getModulePath');
const path = require('path');

// Given a module, return it's location on disk.
function getModuleLocation(
  modules,
  mod,
  knownPaths={},
  pathPrefix="dist/",
  appendTrailingIndexFilesToNodeModules=false,
  entryPointModuleId=1
) {
  let moduleHierarchy;
  let modulePaths = [];

  // Assemble a tree of modules starting at the entry point.
  let tree = makeModuleTree(modules, entryPointModuleId);

  // If the module response contains a lookup table for modules that are required in by the current
  // module being iterated over, then calculate the hierachy of the requires to reconstruct the
  // tree.
  if (mod.lookup) {
    // Given a module, determine where it was imported within.
    console.log(`* Reconstructing require path for module ${mod.id}...`);

    let {completeEvents, incompleteEvents} = getAllPathsToModule(
      tree,
      mod.id,
      knownPaths
    );

    modulePaths = completeEvents;
  } else if (knownPaths[mod.id]) {
    // Use a known path if it exists.
    modulePaths = [{id: mod.id, path: knownPaths[mod.id]}];
  } else {
    // Final fallback - the name of the file is the module id.
    console.log(`* No lookup tabie for module ${mod.id}, so using identifier as require path...`);
    modulePaths = [{id: mod.id, path: `./${mod.id}`}];
  }

  /* ['./foo'] => './foo'
   * ['../foo'] => '../foo'
   * ['uuid', './foo'] => 'node_modules/uuid/foo'
   * ['uuid', './foo', './bar'] => 'node_modules/uuid/bar'
   * ['uuid', './bar/foo', './baz'] => 'node_modules/uuid/bar/baz'
   * ['abc', './foo', 'uuid', './bar'] => 'node_modules/uuid/bar'
   */

  let rootNodeModule = '';
  let requirePaths = modulePaths.map(modulePath => {
    return modulePath.reduce((acc, mod, ct) => {
      if (!mod.path.startsWith('.')) {
        // A root node module overrides the require tree, since paths are relative to it.
        rootNodeModule = mod.path;
        return [];
      } else if (ct === modulePath.length - 1) {
        // When we get to the last item, return the filename as part of the require path.
        return [...acc, mod.path || 'index'];
      } else {
        // A file import. However, this part is the directory only since further requires will
        // "stack" on top of this one. Therefore, the file that's being included is irrelevant until
        // the last item in the hierarchy (ie, the above case).
        return [...acc, path.dirname(mod.path)];
      }
    }, []);
  });

  // FIXME: currently just taking the first require path. Some smartness can be accomplished by
  // cross referencing between multiple require paths.
  let requirePath = requirePaths[0];

  if (requirePath.length > 0) {
    modulePath = path.join(...requirePath);
  } else if (!rootNodeModule) {
    modulePath = 'index';
  } else {
    // If a root node module, then leave it empty. The root node module's index is implied.
    // Ie, you don't need to do `foo/index`, you can just do `foo`.
    modulePath = appendTrailingIndexFilesToNodeModules ? 'index' : '';
  }

  if (rootNodeModule) {
    modulePath = `node_modules/${rootNodeModule}/${modulePath}`;
  }

  console.log(`* ${mod.id} => ${modulePath}`);

  let filePath = path.join(pathPrefix, modulePath);

  // If a filePath has a bunch of `../`s at the end, then it's broken (it broke out of the dist
  // folder!) In this cae, tell the user we need an absolute path of one of the files in order to
  // resolve it. Log out each of the paths along the require tree and it's respective module id.
  if (!filePath.startsWith(pathPrefix)) {
    let err = `Don't have enough information to expand bundle into named files. The process requires the path of one of the below to be explicitly defined:`;
    // ${moduleHierarchy.map(([mod, stack]) => `- ${mod} (${stack.slice(-1)[0]})`).join('\n')}`;
    throw new Error(err);
  }

  return filePath;
}

function reverseObject(obj) {
  return Object.keys(obj).reduce((acc, i) => {
    acc[obj[i]] = i; // Reverse keys and values
    return acc;
  }, {});
}

module.exports = getModuleLocation;

if (require.main === module) {
  let modules = [
    {id: 1, code: null, lookup: {'./foo': 2, 'uuid': 3}},
    {id: 2, code: null, lookup: {'./bar/baz': 4}},
    {id: 3, code: null, lookup: {}},
    {id: 4, code: null, lookup: {'uuid': 3, '../hello': 5}},
    {id: 5, code: null, lookup: {}},
  ];

  let output = getModuleLocation(modules, modules.find(i => i.id === 4), {1: './hello/world'});

  console.log(output);
}
