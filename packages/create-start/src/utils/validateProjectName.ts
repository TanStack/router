import validate from 'validate-npm-package-name'

type ValidatationResult =
  | {
      valid: true
    }
  | {
      valid: false
      problems: Array<string>
    }

export function validateProjectName(name: string): ValidatationResult {
  const nameValidation = validate(name)
  if (nameValidation.validForNewPackages) {
    return { valid: true }
  }

  return {
    valid: false,
    problems: [
      ...(nameValidation.errors || []),
      ...(nameValidation.warnings || []),
    ],
  }
}
