export class SessionExpiredError extends Error {
  constructor() {
    super('The stored session is no longer accepted by the API.');
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super('No session is available; the pilot has to sign in.');
  }
}
