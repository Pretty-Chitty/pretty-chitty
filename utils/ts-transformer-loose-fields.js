/**
 * TypeScript transformer that makes class fields behave like Babel's loose mode:
 * All declared class fields (even optional ones without initializers) become enumerable own properties.
 */
const ts = require("typescript");

function transformer(program) {
  return (context) => {
    return (sourceFile) => {
      function visit(node) {
        // Find class declarations
        if (ts.isClassDeclaration(node)) {
          const members = node.members.map((member) => {
            // Find property declarations without initializers
            if (
              ts.isPropertyDeclaration(member) &&
              !member.initializer &&
              !ts.isComputedPropertyName(member.name) &&
              !member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)
            ) {
              // Add `= undefined` initializer to make it enumerable
              return ts.factory.updatePropertyDeclaration(
                member,
                member.modifiers,
                member.name,
                member.questionToken || member.exclamationToken,
                member.type,
                ts.factory.createIdentifier("undefined") // Add initializer
              );
            }
            return member;
          });

          return ts.factory.updateClassDeclaration(
            node,
            node.modifiers,
            node.name,
            node.typeParameters,
            node.heritageClauses,
            members
          );
        }

        return ts.visitEachChild(node, visit, context);
      }

      return ts.visitNode(sourceFile, visit);
    };
  };
}

module.exports = transformer;
