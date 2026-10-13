/**
 * @ekbill/render: the printed bill. Stage 6 ports the MVP's templates
 * (classic, modern, simple; A4, A5, 80mm, 58mm; JPEG) onto v2's snapshot.
 * Listed in tokens-allow.txt: the paper is deliberately not themed.
 */
export const PAPERS = ['a4', 'a5', '80mm', '58mm'] as const;
export type Paper = (typeof PAPERS)[number];
