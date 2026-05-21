declare module 'verisure' {
  class VerisureClient {
    constructor(email: string, password: string, cookies?: string[]);

    cookies: string[];

    getToken(code?: string): Promise<void>;

    getCookie(name: string): string | undefined;

    getInstallations(): Promise<Array<{
      config: { alias: string };
      client: (operation: object) => Promise<object>;
      giid?: string;
    }>>;
  }

  export = VerisureClient;
}
