const { Converter, ReflectionKind } = require("typedoc");

/**
 * @param {import('typedoc').Application} app
 */
exports.load = function (app) {
  app.converter.on(Converter.EVENT_CREATE_DECLARATION, (context, reflection) => {
    // Filter out any member that starts with $internal_
    if (reflection.name && reflection.name.startsWith("$internal_")) {
      // Remove the reflection by preventing it from being added
      return;
    }
  });

  app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
    // Remove all reflections that start with $internal_
    const project = context.project;

    function removeInternalMembers(reflection) {
      // Filter children (properties, methods, etc.)
      if (reflection.children) {
        reflection.children = reflection.children.filter((child) => {
          if (child.name && child.name.startsWith("$internal_")) {
            return false;
          }
          // Recursively process children
          removeInternalMembers(child);
          return true;
        });
      }

      // Filter parameters (constructor/method parameters)
      if (reflection.signatures) {
        reflection.signatures.forEach((signature) => {
          if (signature.parameters) {
            signature.parameters = signature.parameters.filter((param) => {
              return !(param.name && param.name.startsWith("$internal_"));
            });
          }
        });
      }

      // Filter type parameters and other nested structures
      if (reflection.type && reflection.type.declaration) {
        removeInternalMembers(reflection.type.declaration);
      }
    }

    removeInternalMembers(project);
  });
};
