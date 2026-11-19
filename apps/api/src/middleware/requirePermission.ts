import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errorHandler.js';

export interface RequirePermissionOptions {
  branchFrom?: 'params' | 'body' | 'query';
  branchKey?: string;
}

export function requirePermission(
  permissionCode: string,
  options: RequirePermissionOptions = {}
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.accessContext) {
      return next(new UnauthorizedError('Authentication required to verify permissions'));
    }

    // 1. Check functional permission code
    if (!req.accessContext.hasPermission(permissionCode)) {
      return next(
        new ForbiddenError(
          `Access Denied: Missing required permission "${permissionCode}"`,
          { requiredPermission: permissionCode }
        )
      );
    }

    // 2. Check branch-level scope if requested
    if (options.branchFrom) {
      const source = req[options.branchFrom] as Record<string, unknown> | undefined;
      const key = options.branchKey || 'branchId';
      const branchId = source?.[key];

      if (branchId && typeof branchId === 'string') {
        if (!req.accessContext.canAccessBranch(branchId)) {
          // Rule 2: Out-of-scope branch resources MUST return 404 to avoid leaking existence
          return next(new NotFoundError(`Resource in branch "${branchId}" not found`));
        }
      }
    }

    next();
  };
}
