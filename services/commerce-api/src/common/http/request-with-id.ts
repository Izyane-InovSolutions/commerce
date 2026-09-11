import type { Request } from 'express';

export type RequestWithId = Request & { id: string };

export const REQUEST_ID_HEADER = 'x-request-id';
