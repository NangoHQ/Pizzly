declare global {
    namespace Express {
        interface User {
            id: number;
            email: string;
            name: string;
            account_id: number;
        }
    }
}

declare module 'express-session' {
    interface SessionData {
        debugMode?: boolean;
    }
}

// https://stackoverflow.com/questions/65805015/extending-session-object-in-express-session
// required to re-export the types
export {};
