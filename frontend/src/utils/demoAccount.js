const DEMO_USER_EMAIL = 'usuario@ftgroup.test'

export function isDemoFinanceAccount(user) {
  return user?.email?.trim().toLowerCase() === DEMO_USER_EMAIL
}

export function usesLocalFinance(user, mode = 'api') {
  return mode === 'local' || isDemoFinanceAccount(user)
}
