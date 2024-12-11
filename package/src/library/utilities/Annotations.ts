const NON_EDITABLE = "NonEditable";

function annotationToPropName(key: string, category: string) {
  return `__${key}__${category}`;
}

function Annotation(category: string): any {
  const result = function (cls: any, key: string) {
    Object.defineProperty(cls, annotationToPropName(key, category), {
      value: true,
      enumerable: false,
    });
    return {
      writable: true,
      configurable: true,
    };
  };
  result.__name = category;
  return result;
}

export function checkAnnotation(
  obj: any,
  key: string,
  annotation: any
): boolean {
  return obj[annotationToPropName(key, annotation.__name)] === true;
}

export const NonEditable = Annotation(NON_EDITABLE);
