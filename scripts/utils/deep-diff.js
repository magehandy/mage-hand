export function deepDiff(oldObj, newObj, path = '') {
  const diff = {};
  
  if (oldObj === newObj) {
    return diff;
  }
  
  if (isPrimitive(oldObj) || isPrimitive(newObj)) {
    if (oldObj !== newObj) {
      return {
        type: 'update',
        old: oldObj,
        value: newObj
      };
    }
    return diff;
  }
  
  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    if (JSON.stringify(oldObj) !== JSON.stringify(newObj)) {
      return {
        type: 'update',
        old: oldObj,
        value: newObj
      };
    }
    return diff;
  }
  
  const allKeys = new Set([
    ...Object.keys(oldObj || {}),
    ...Object.keys(newObj || {})
  ]);
  
  allKeys.forEach(key => {
    const currentPath = path ? `${path}.${key}` : key;
    const oldValue = oldObj ? oldObj[key] : undefined;
    const newValue = newObj ? newObj[key] : undefined;
    
    if (oldValue === undefined && newValue !== undefined) {
      diff[currentPath] = {
        type: 'add',
        value: newValue
      };
    } else if (oldValue !== undefined && newValue === undefined) {
      diff[currentPath] = {
        type: 'delete',
        old: oldValue
      };
    } else if (isPrimitive(oldValue) || isPrimitive(newValue)) {
      if (oldValue !== newValue) {
        diff[currentPath] = {
          type: 'update',
          old: oldValue,
          value: newValue
        };
      }
    } else if (Array.isArray(oldValue) || Array.isArray(newValue)) {
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        diff[currentPath] = {
          type: 'update',
          old: oldValue,
          value: newValue
        };
      }
    } else if (typeof oldValue === 'object' && typeof newValue === 'object') {
      const nestedDiff = deepDiff(oldValue, newValue, currentPath);
      Object.assign(diff, nestedDiff);
    }
  });
  
  return diff;
}

function isPrimitive(value) {
  return value === null || 
         value === undefined || 
         typeof value === 'string' || 
         typeof value === 'number' || 
         typeof value === 'boolean';
}

export function applyDiff(target, diff) {
  const result = JSON.parse(JSON.stringify(target));
  
  Object.keys(diff).forEach(path => {
    const change = diff[path];
    const pathParts = path.split('.');
    const lastKey = pathParts.pop();
    
    let current = result;
    for (const part of pathParts) {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    switch (change.type) {
      case 'add':
      case 'update':
        current[lastKey] = change.value;
        break;
      case 'delete':
        delete current[lastKey];
        break;
    }
  });
  
  return result;
}