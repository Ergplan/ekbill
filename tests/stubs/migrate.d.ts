declare module '@ekbill/db/migrate' {
  export function migrate(url: string, options?: { log?: (line: string) => void }): Promise<number>;
}
