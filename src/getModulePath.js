
let getModulePathMemory = {};
function getModulePath(modules, moduleId, knownPaths, moduleStack=[]) {
  // Memoize this beast. If a module has already been traversed, then just return it's cached
  // output.
  if (getModulePathMemory[moduleId]) {
    return getModulePathMemory[moduleId];
  }

  // For each module, attempt to lookup the module id.
  return modules.map(m => {
    // If the module doesn't have modules to lookup, then return false.
    if (!m.lookup) { return false; }

    // Do a reverse lookup since we need to get the module names (keys) that match a specified value
    // (module id)
    let moduleName;
    if (moduleName = moduleHasIdInLookupTable(m, moduleId)) {
      // If the path has already been defined, go with it.
      if (knownPaths[moduleId]) {
        return [[knownPaths[moduleId], []]];
      }

      // Prevent circular dependencies. If we come across a module that's already been required in
      // a given tree, then stop walking down that leg of the tree.
      let parentModule;
      if (moduleStack.indexOf(m.id) === -1) {
        parentModule = getModulePath(modules, m.id, knownPaths, [...moduleStack, m.id]);
        getModulePathMemory[m.id] = parentModule;
      } else {
        console.log(`* Circular dependency discovered! ${moduleStack} ${moduleName}`);
        return false;
      }

      if (parentModule) {
        return [...parentModule, [moduleName, moduleStack]];
      } else {
        return [[moduleName, moduleStack]];
      }
    } else {
      // Module isn't in the lookup table, move on to the next module in the list.
      return false;
    }
  }).find(i => i); // Find the first module that matches.
}


// Given a module and another module's id, find if the given module has the other module in it's
// lookup table. If it does, return the relative path to that module from the current module.
// Otherwise, return false.
// moduleHasIdInLookupTable({id: 5, lookup: {'./foo': 6, './bar': 7}}, 7)
// => ./bar
// moduleHasIdInLookupTable({id: 5, lookup: {'./foo': 6, './bar': 7}}, 8)
// => false
function moduleHasIdInLookupTable(mod, id) {
  if (mod.lookup) {
    let reverseLookup = objectValues(mod.lookup);
    let moduleIdIndex = reverseLookup.indexOf(id);
    if (moduleIdIndex >= 0) {
      // Since the index's between keys / values are one-to-one, lookup in the other array.
      return Object.keys(mod.lookup)[moduleIdIndex];
    } else {
      return false;
    }
  } else {
    return false;
  }
}

// Return the values of an object as an array.
function objectValues(obj) {
  return Object.keys(obj).map(k => obj[k]);
}


module.exports = {
  default: getModulePath,
  getModulePathMemory,
};


// const modpath = getModulePath([
//   {id: 1, lookup: {'./foo': 2}},
//   {id: 2, lookup: {'./bar/baz': 3}},
//   {id: 3, lookup: {}},
// ], 3)
