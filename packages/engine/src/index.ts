/**
 * @ekbill/engine: pure and deterministic (eslint enforces it). Stage 1 ships
 * the structural checks and money arithmetic copied from the MVP, used by the
 * prototype's forms; Stage 3 adds tax, the rule pack, document types,
 * numbering, prepareIssue and workings.
 */
export const ENGINE_VERSION = '2.0.0-stage1';

export {
  computeTax,
  emptyTax,
  type Registration,
  type TaxInput,
  type TaxLine,
  type TaxLineInput,
  type TaxResult,
} from './tax';
export {
  GST_RULES,
  RuleError,
  documentKind,
  documentKindRule,
  placeOfSupply,
  ruleOn,
  selectableRates,
  supplyKind,
  type DocumentKind,
  type RuleEntry,
  type RuleKind,
  type RulePack,
  type StateHead,
  type Supply,
  type SupplyDecision,
} from './rules';

export {
  checkGstin,
  checkPan,
  gstinCheckDigit,
  isValidGstin,
  stateCodeOfGstin,
  type GstinCheck,
  type GstinProblem,
} from './ids';
export { GST_STATES, STATE_CODE_TABLE_VERSION, findState, type GstState, type TaxAuthority } from './state-codes';
export {
  MoneyError,
  amountInWords,
  applyBasisPoints,
  assertSafe,
  divRound,
  formatMoneyIndian,
  formatMoneyPlain,
  formatPercentPlain,
  formatQuantityPlain,
  lineGross,
  parseMoney,
  parsePercent,
  parseQuantity,
  roundToRupee,
  sum,
  taxableFromInclusive,
  type BasisPoints,
  type Milli,
  type Paise,
} from './money';
