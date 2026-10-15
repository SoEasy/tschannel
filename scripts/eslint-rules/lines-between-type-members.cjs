/** Require a blank line between interface and object-type members, including their leading comments. */
module.exports = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    docs: {
      description: 'Require a blank line between TypeScript interface and object-type members',
    },
    messages: {
      expected: 'Expected a blank line between type members.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function checkMembers(members) {
      for (let index = 1; index < members.length; index += 1) {
        const previous = members[index - 1];
        const current = members[index];
        const leadingComments = sourceCode
          .getCommentsBefore(current)
          .filter((comment) => comment.loc.start.line > previous.loc.end.line);
        const firstPart = leadingComments[0] ?? current;

        if (firstPart.loc.start.line > previous.loc.end.line + 1) {
          continue;
        }

        context.report({
          node: current,
          messageId: 'expected',
          fix(fixer) {
            if (firstPart.loc.start.line === previous.loc.end.line) {
              return fixer.insertTextBefore(firstPart, '\n\n');
            }

            return fixer.insertTextAfter(previous, '\n');
          },
        });
      }
    }

    return {
      TSInterfaceBody(node) {
        checkMembers(node.body);
      },
      TSTypeLiteral(node) {
        if (node.loc.start.line < node.loc.end.line) {
          checkMembers(node.members);
        }
      },
    };
  },
};
