import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import crypto from 'crypto';

export function generateImage(): Result<string> {
    const charset = '0123456789abcdef';
    const length = 40;
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    const commitHash = Array.from(randomBytes)
        .map((byte) => charset[byte % charset.length])
        .join('');
    if (commitHash.length !== 40) {
        return Err('CommitHash must be exactly 40 characters');
    }
    return Ok(`generated/image:${commitHash}`);
}
