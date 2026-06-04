const TOKEN = {
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',

  IDENTIFIER: 'IDENTIFIER',

  STRING: 'STRING',
  NUMBER: 'NUMBER',

  EQ: 'EQ',
  NE: 'NE',

  GT: 'GT',
  GTE: 'GTE',

  LT: 'LT',
  LTE: 'LTE',

  AND: 'AND',
  OR: 'OR',

  EOF: 'EOF',
};

class Lexer {
  constructor(input) {
    this.input = input;
    this.position = 0;
  }

  current() {
    return this.input[this.position];
  }

  advance() {
    this.position++;
  }

  skipWhitespace() {
    while (
      this.position < this.input.length &&
      /\s/.test(this.current())
    ) {
      this.advance();
    }
  }

  readIdentifier() {
    let value = '';

    while (
      this.position < this.input.length &&
      /[a-zA-Z0-9_]/.test(this.current())
    ) {
      value += this.current();
      this.advance();
    }

    const lower = value.toLowerCase();

    if (lower === 'and') {
      return {
        type: TOKEN.AND,
        value
      };
    }

    if (lower === 'or') {
      return {
        type: TOKEN.OR,
        value
      };
    }

    return {
      type: TOKEN.IDENTIFIER,
      value
    };
  }

  readNumber() {
    let value = '';

    while (
      this.position < this.input.length &&
      /[0-9.]/.test(this.current())
    ) {
      value += this.current();
      this.advance();
    }

    return {
      type: TOKEN.NUMBER,
      value: Number(value)
    };
  }

  readString() {
    this.advance();

    let value = '';

    while (this.position < this.input.length) {
      const char = this.current();

      if (char === "'") {
        this.advance();

        return {
          type: TOKEN.STRING,
          value
        };
      }

      value += char;
      this.advance();
    }

    throw new Error(`Unterminated string "${value}"`);
  }

  nextToken() {
    this.skipWhitespace();

    if (this.position >= this.input.length) {
      return {
        type: TOKEN.EOF
      };
    }

    const char = this.current();

    if (char === '(') {
      this.advance();

      return {
        type: TOKEN.LPAREN,
        value: '('
      };
    }

    if (char === ')') {
      this.advance();

      return {
        type: TOKEN.RPAREN,
        value: ')'
      };
    }

    if (char === '=') {
      this.advance();

      return {
        type: TOKEN.EQ,
        value: '='
      };
    }

    if (char === '!') {
      this.advance();

      if (this.current() === '=') {
        this.advance();

        return {
          type: TOKEN.NE,
          value: '!='
        };
      }

      throw new Error('Expected = after !');
    }

    if (char === '>') {
      this.advance();

      if (this.current() === '=') {
        this.advance();

        return {
          type: TOKEN.GTE,
          value: '>='
        };
      }

      return {
        type: TOKEN.GT,
        value: '>'
      };
    }

    if (char === '<') {
      this.advance();

      if (this.current() === '=') {
        this.advance();

        return {
          type: TOKEN.LTE,
          value: '<='
        };
      }

      return {
        type: TOKEN.LT,
        value: '<'
      };
    }

    if (char === "'") {
      return this.readString();
    }

    if (/[0-9]/.test(char)) {
      return this.readNumber();
    }

    if (/[a-zA-Z_]/.test(char)) {
      return this.readIdentifier();
    }

    throw new Error(
      `Unexpected character '${char}'`
    );
  }

  tokenize() {
    const tokens = [];

    while (true) {
      const token = this.nextToken();

      tokens.push(token);

      if (token.type === TOKEN.EOF) {
        break;
      }
    }

    return tokens;
  }
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.current = 0;
  }

  peek() {
    return this.tokens[this.current];
  }

  consume() {
    return this.tokens[this.current++];
  }

  expect(type) {
    const token = this.consume();

    if (!token || token.type !== type) {
      throw new Error(`Expected "${type}", got "${token?.type}"`);
    }

    return token;
  }

  parse() {
    const ast = this.parseOr();

    if (
      this.peek() &&
      this.peek().type !== TOKEN.EOF
    ) {
      throw new Error(`Unexpected token "${this.peek().value}"`);
    }

    return ast;
  }

  parseOr() {
    let node = this.parseAnd();

    while (
      this.peek() &&
      this.peek().type === TOKEN.OR
    ) {
      this.consume();

      node = {
        type: 'or',
        left: node,
        right: this.parseAnd(),
      };
    }

    return node;
  }

  parseAnd() {
    let node = this.parsePrimary();

    while (
      this.peek() &&
      this.peek().type === TOKEN.AND
    ) {
      this.consume();

      node = {
        type: 'and',
        left: node,
        right: this.parsePrimary(),
      };
    }

    return node;
  }

  parsePrimary() {
    if (this.peek().type === TOKEN.LPAREN) {
      this.consume();

      const node = this.parseOr();

      this.expect(TOKEN.RPAREN);

      return node;
    }

    return this.parseComparison();
  }

  parseComparison() {
    const field =
      this.expect(TOKEN.IDENTIFIER).value;

    const operator =
      this.consume();

    const allowedOperators = [
      TOKEN.EQ,
      TOKEN.NE,
      TOKEN.GT,
      TOKEN.GTE,
      TOKEN.LT,
      TOKEN.LTE,
    ];

    if (!allowedOperators.includes(operator.type)) {
      throw new Error(`Unexpected operator "${operator.type}"`);
    }

    const valueToken =
      this.consume();

    if (
      valueToken.type !== TOKEN.STRING &&
      valueToken.type !== TOKEN.NUMBER
    ) {
      throw new Error(`Expected value, got "${valueToken.type}"`);
    }

    return {
      type: 'comparison',
      field,
      operator: operator.value,
      value: valueToken.value,
    };
  }

  parseValue(value) {
    return value;
  }
}

export const ALLOWED_FIELDS = {
  id: 'id',
  created_at: 'created_at',
  repository: 'repository',
  operation: 'operation',
  status: 'status',
  entity: 'entity',
  file: 'file',
  author: 'author',
  author_email: 'author_email',
  commit_sha: 'commit_sha',
  job_id: 'job_id',
  origin_job_id: 'origin_job_id',
  error_message: 'error_message',
  metadata: 'metadata',
};

export function astToSql(ast) {
  const params = [];

  function visit(node) {
    switch (node.type) {
      case 'comparison': {
        const column =
          ALLOWED_FIELDS[node.field];

        if (!column) {
          throw new Error(`Invalid field "${node.field}"`);
        }

        params.push(node.value);

        return `${column} ${node.operator} ?`;
      }

      case 'and':
        return `(${visit(node.left)} AND ${visit(node.right)})`;

      case 'or':
        return `(${visit(node.left)} OR ${visit(node.right)})`;

      default:
        throw new Error(`Unknown node type "${node.type}"`);
    }
  }

  return {
    sql: visit(ast),
    params,
  };
}

export function parseFilters(filters) {
  const lexer = new Lexer(filters);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const result = astToSql(ast);
  return result;
}