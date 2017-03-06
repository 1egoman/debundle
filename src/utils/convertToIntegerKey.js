function convertToIntegerKey(obj, gracefulFailure=true) {
  return Object.keys(obj).reduce((acc, i) => {
    let key = parseInt(i);
    let value = obj[i];

    if (isNaN(key) && gracefulFailure) {
      key = i; // Just make the key the same as it was before
    } else {
      throw new Error(`Key ${i} isn't an integer!`);
    }

    acc[key] = value;
    return acc;
  }, {});
}

module.exports = convertToIntegerKey;
