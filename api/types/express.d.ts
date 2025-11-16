import { ApiEndpoint } from '../database';

declare global {
  namespace Express {
    interface Request {
      apiKey?: string;
      apiKeyGroup?: string;
      targetEndpoint?: ApiEndpoint;
      startTime?: number;
    }
  }
}