export type AngleMode = 'DEG' | 'RAD';

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' };

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

function tokenize(raw: string): Token[] {
  const expr = raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .trim();

  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let numStr = '';
      let dotCount = 0;
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        if (expr[i] === '.') dotCount++;
        if (dotCount > 1) throw new Error('Invalid number');
        numStr += expr[i];
        i++;
      }
      if (numStr === '.') throw new Error('Invalid number');
      const value = Number(numStr);
      if (Number.isNaN(value)) throw new Error('Invalid number');

      // Support implicit multiplication like 2pi or 2(3)
      tokens.push({ type: 'number', value });
      if (i < expr.length && (expr[i] === '(' || /[a-zA-Zπ√]/.test(expr[i]))) {
        tokens.push({ type: 'op', value: '*' });
      }
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      const lower = ident.toLowerCase();
      if (lower in CONSTANTS) {
        tokens.push({ type: 'number', value: CONSTANTS[lower] });
        if (i < expr.length && (expr[i] === '(' || /[0-9.]/.test(expr[i]))) {
          tokens.push({ type: 'op', value: '*' });
        }
      } else {
        tokens.push({ type: 'ident', value: lower });
      }
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      if (i < expr.length && (expr[i] === '(' || /[0-9a-zA-Zπ√]/.test(expr[i]))) {
        tokens.push({ type: 'op', value: '*' });
      }
      continue;
    }

    if ('+-*/%^'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected token: ${ch}`);
  }

  return tokens;
}

export function evaluateExpression(raw: string, angleMode: AngleMode = 'DEG'): number {
  const tokens = tokenize(raw);
  if (tokens.length === 0) return 0;

  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const toRad = (val: number) => (angleMode === 'DEG' ? (val * Math.PI) / 180 : val);

  function parseExpression(): number {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek() as { type: 'op'; value: string }).value.match(/^[+-]$/)) {
      const op = (consume() as { type: 'op'; value: string }).value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (
      peek()?.type === 'op' &&
      ['*', '/', '%'].includes((peek() as { type: 'op'; value: string }).value)
    ) {
      const op = (consume() as { type: 'op'; value: string }).value;
      const right = parsePower();
      if (op === '*') left *= right;
      else if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        left /= right;
      } else if (op === '%') {
        left = left % right;
      }
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (peek()?.type === 'op' && (peek() as { type: 'op'; value: string }).value === '^') {
      consume();
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    const tok = peek();
    if (tok?.type === 'op' && (tok.value === '-' || tok.value === '+')) {
      consume();
      const val = parseUnary();
      return tok.value === '-' ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of expression');

    if (tok.type === 'number') {
      consume();
      // Handle postfix % (percentage) when followed by end or operator other than number
      if (
        peek()?.type === 'op' &&
        (peek() as { type: 'op'; value: string }).value === '%' &&
        (!tokens[pos + 1] || tokens[pos + 1].type === 'op' || tokens[pos + 1].type === 'rparen')
      ) {
        consume();
        return tok.value / 100;
      }
      return tok.value;
    }

    if (tok.type === 'lparen') {
      consume();
      const val = parseExpression();
      if (peek()?.type !== 'rparen') throw new Error('Missing closing parenthesis');
      consume();
      return val;
    }

    if (tok.type === 'ident') {
      const fn = (consume() as { type: 'ident'; value: string }).value;
      const arg = parsePrimary();
      switch (fn) {
        case 'sin':
          return Math.sin(toRad(arg));
        case 'cos':
          return Math.cos(toRad(arg));
        case 'tan':
          return Math.tan(toRad(arg));
        case 'sqrt':
          if (arg < 0) throw new Error('Invalid root');
          return Math.sqrt(arg);
        case 'ln':
          if (arg <= 0) throw new Error('Invalid log');
          return Math.log(arg);
        case 'log':
          if (arg <= 0) throw new Error('Invalid log');
          return Math.log10(arg);
        case 'abs':
          return Math.abs(arg);
        case 'sq':
          return arg * arg;
        default:
          throw new Error(`Unknown function: ${fn}`);
      }
    }

    throw new Error('Invalid expression');
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error('Invalid syntax');
  if (!Number.isFinite(result)) throw new Error('Math error');
  return result;
}

export function formatCalculatorNumber(num: number): string {
  if (!Number.isFinite(num)) return 'Error';
  if (Object.is(num, -0)) return '0';
  const rounded = Number(num.toPrecision(12));
  if (Math.abs(rounded) >= 1e12 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-8)) {
    return rounded.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return String(rounded);
}

export function isPureNumericPinCandidate(expression: string): boolean {
  return /^\d{3,12}$/.test(expression.trim());
}
