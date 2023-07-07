export interface Environment {
    id: number;
    name: string;
    account_id: number;
    secret_key: string;
    public_key: string;
    secret_key_iv?: string | null;
    secret_key_tag?: string | null;
    callback_url: string | null;
    webhook_url: string | null;
    websockets_path: string | null;
    hmac_enabled: boolean;
    hmac_key: string | null;
    created_at: string;
    updated_at: string;
}
