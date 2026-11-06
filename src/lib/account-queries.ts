import { queryOptions } from '@tanstack/react-query';
import { getProfile } from '@/lib/account.functions';
export const profileQuery = queryOptions({ queryKey: ['account-profile'], queryFn: () => getProfile() });