/**
 * What the engine says to the owner: a dictionary key and its parameters,
 * never the text. The screens render it with t() in the person's register
 * (the engine is pure; it owns no words). Every blocker, problem and
 * working line is a Say.
 */
export interface Say {
  key: string;
  params?: Record<string, string | number>;
}
export const say = (key: string, params?: Record<string, string | number>): Say => (params ? { key, params } : { key });
