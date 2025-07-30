# How to Use Server Functions with Forms

Learn how to integrate server functions with forms in TanStack Start applications for type-safe, validated form submissions with proper error handling and user feedback.

## Quick Start

```tsx
// app/functions/contact.ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

const ContactFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters')
})

export const submitContactForm = createServerFn()
  .validator(ContactFormSchema)
  .handler(async ({ data }) => {
    // Process form submission
    console.log('Contact form submitted:', data)
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return { 
      success: true, 
      message: 'Thank you for your message!' 
    }
  })
```

```tsx
// app/routes/contact.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { submitContactForm } from '../functions/contact'

export const Route = createFileRoute('/contact')({
  component: ContactForm,
})

function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    
    try {
      const response = await submitContactForm({ data: formData })
      setResult(response)
      setFormData({ name: '', email: '', message: '' }) // Reset form
    } catch (error) {
      setErrors({ general: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Name:</label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
        />
      </div>
      
      <div>
        <label htmlFor="email">Email:</label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          required
        />
      </div>
      
      <div>
        <label htmlFor="message">Message:</label>
        <textarea
          id="message"
          value={formData.message}
          onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
          required
        />
      </div>
      
      <button type="submit" disabled={submitting}>
        {submitting ? 'Sending...' : 'Send Message'}
      </button>
      
      {errors.general && <div style={{ color: 'red' }}>{errors.general}</div>}
      {result && <div style={{ color: 'green' }}>{result.message}</div>}
    </form>
  )
}
```

## Step-by-Step Implementation

### 1. Create Form Server Functions

Define server functions with proper validation for form data:

```typescript
// app/functions/user.ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

// User registration form
const RegisterSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

export const registerUser = createServerFn()
  .validator(RegisterSchema)
  .handler(async ({ data }) => {
    // Check if user already exists
    const existingUser = await checkUserExists(data.email)
    if (existingUser) {
      throw new Error('User with this email already exists')
    }
    
    // Create user (exclude confirmPassword from stored data)
    const { confirmPassword, ...userData } = data
    const user = await createUser(userData)
    
    return { 
      success: true, 
      userId: user.id,
      message: 'Account created successfully!' 
    }
  })

// Profile update form
const UpdateProfileSchema = z.object({
  userId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional().or(z.literal(''))
})

export const updateProfile = createServerFn()
  .validator(UpdateProfileSchema)
  .handler(async ({ data }) => {
    const updatedUser = await updateUserProfile(data.userId, {
      firstName: data.firstName,
      lastName: data.lastName,
      bio: data.bio || null,
      website: data.website || null
    })
    
    return { 
      success: true, 
      user: updatedUser,
      message: 'Profile updated successfully!' 
    }
  })
```

### 2. Handle Form Validation

Implement client-side and server-side validation:

```tsx
// app/routes/register.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { registerUser } from '../functions/user'

export const Route = createFileRoute('/register')({
  component: RegisterForm,
})

function RegisterForm() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Client-side validation
  const validateField = (name, value) => {
    const newErrors = { ...errors }
    
    switch (name) {
      case 'username':
        if (value.length < 3) {
          newErrors.username = 'Username must be at least 3 characters'
        } else {
          delete newErrors.username
        }
        break
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(value)) {
          newErrors.email = 'Invalid email address'
        } else {
          delete newErrors.email
        }
        break
      case 'password':
        if (value.length < 8) {
          newErrors.password = 'Password must be at least 8 characters'
        } else {
          delete newErrors.password
        }
        break
      case 'confirmPassword':
        if (value !== formData.password) {
          newErrors.confirmPassword = "Passwords don't match"
        } else {
          delete newErrors.confirmPassword
        }
        break
    }
    
    setErrors(newErrors)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    validateField(name, value)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    
    try {
      const result = await registerUser({ data: formData })
      alert(result.message)
      // Redirect to login or dashboard
    } catch (error) {
      setErrors({ general: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="username">Username:</label>
        <input
          id="username"
          name="username"
          type="text"
          value={formData.username}
          onChange={handleChange}
          required
        />
        {errors.username && <span className="error">{errors.username}</span>}
      </div>
      
      <div>
        <label htmlFor="email">Email:</label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
        />
        {errors.email && <span className="error">{errors.email}</span>}
      </div>
      
      <div>
        <label htmlFor="password">Password:</label>
        <input
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          required
        />
        {errors.password && <span className="error">{errors.password}</span>}
      </div>
      
      <div>
        <label htmlFor="confirmPassword">Confirm Password:</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={handleChange}
          required
        />
        {errors.confirmPassword && <span className="error">{errors.confirmPassword}</span>}
      </div>
      
      <button 
        type="submit" 
        disabled={submitting || Object.keys(errors).length > 0}
      >
        {submitting ? 'Creating Account...' : 'Register'}
      </button>
      
      {errors.general && <div className="error">{errors.general}</div>}
    </form>
  )
}
```

### 3. Handle File Uploads

Integrate file uploads with server functions:

```typescript
// app/functions/upload.ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

const FileUploadSchema = z.object({
  file: z.instanceof(File),
  description: z.string().optional()
})

export const uploadFile = createServerFn()
  .validator(FileUploadSchema)
  .handler(async ({ data }) => {
    const { file, description } = data
    
    // Validate file type and size
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.')
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      throw new Error('File size must be less than 5MB')
    }
    
    // Process file upload (save to storage, etc.)
    const fileUrl = await saveFileToStorage(file)
    
    return {
      success: true,
      fileUrl,
      fileName: file.name,
      description
    }
  })
```

```tsx
// app/routes/upload.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { uploadFile } from '../functions/upload'

export const Route = createFileRoute('/upload')({
  component: FileUploadForm,
})

function FileUploadForm() {
  const [file, setFile] = useState(null)
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    setFile(selectedFile)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!file) {
      setError('Please select a file')
      return
    }
    
    setUploading(true)
    setError('')
    
    try {
      const response = await uploadFile({ 
        data: { file, description } 
      })
      setResult(response)
      setFile(null)
      setDescription('')
      // Reset file input
      e.target.reset()
    } catch (error) {
      setError(error.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="file">Choose File:</label>
        <input
          id="file"
          type="file"
          onChange={handleFileChange}
          accept="image/jpeg,image/png,image/gif"
          required
        />
      </div>
      
      <div>
        <label htmlFor="description">Description (optional):</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your file..."
        />
      </div>
      
      <button type="submit" disabled={uploading || !file}>
        {uploading ? 'Uploading...' : 'Upload File'}
      </button>
      
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {result && (
        <div style={{ color: 'green' }}>
          <p>File uploaded successfully!</p>
          <p>File URL: {result.fileUrl}</p>
        </div>
      )}
    </form>
  )
}
```

### 4. Multi-Step Forms

Handle complex multi-step forms with server functions:

```typescript
// app/functions/onboarding.ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

// Step 1: Basic info
const BasicInfoSchema = z.object({
  sessionId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email()
})

export const saveBasicInfo = createServerFn()
  .validator(BasicInfoSchema)
  .handler(async ({ data }) => {
    await saveOnboardingStep(data.sessionId, 'basicInfo', data)
    return { success: true, nextStep: 'preferences' }
  })

// Step 2: Preferences
const PreferencesSchema = z.object({
  sessionId: z.string(),
  theme: z.enum(['light', 'dark']),
  language: z.string(),
  notifications: z.boolean()
})

export const savePreferences = createServerFn()
  .validator(PreferencesSchema)
  .handler(async ({ data }) => {
    await saveOnboardingStep(data.sessionId, 'preferences', data)
    return { success: true, nextStep: 'complete' }
  })

// Final step: Complete onboarding
const CompleteOnboardingSchema = z.object({
  sessionId: z.string()
})

export const completeOnboarding = createServerFn()
  .validator(CompleteOnboardingSchema)
  .handler(async ({ data }) => {
    const onboardingData = await getOnboardingData(data.sessionId)
    const user = await createUserFromOnboarding(onboardingData)
    await clearOnboardingSession(data.sessionId)
    
    return { 
      success: true, 
      userId: user.id,
      message: 'Welcome! Your account has been created.' 
    }
  })
```

### 5. Form State Management

Create reusable form utilities:

```tsx
// app/utils/useForm.ts
import { useState } from 'react'

export function useForm(initialValues, validationRules = {}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const setValue = (name, value) => {
    setValues(prev => ({ ...prev, [name]: value }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
    
    // Run validation if rules exist
    if (validationRules[name]) {
      const error = validationRules[name](value, values)
      if (error) {
        setErrors(prev => ({ ...prev, [name]: error }))
      }
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setValue(name, type === 'checkbox' ? checked : value)
  }

  const handleSubmit = (serverFn) => async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    
    try {
      const result = await serverFn({ data: values })
      return result
    } catch (error) {
      setErrors({ general: error.message })
      throw error
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setValues(initialValues)
    setErrors({})
    setSubmitting(false)
  }

  return {
    values,
    errors,
    submitting,
    setValue,
    handleChange,
    handleSubmit,
    reset,
    isValid: Object.keys(errors).length === 0
  }
}
```

```tsx
// Using the form utility
import { useForm } from '../utils/useForm'
import { registerUser } from '../functions/user'

function RegistrationForm() {
  const form = useForm(
    { username: '', email: '', password: '', confirmPassword: '' },
    {
      username: (value) => value.length < 3 ? 'Username too short' : null,
      email: (value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'Invalid email' : null,
      password: (value) => value.length < 8 ? 'Password too short' : null,
      confirmPassword: (value, values) => value !== values.password ? "Passwords don't match" : null
    }
  )

  const onSubmit = form.handleSubmit(registerUser)

  return (
    <form onSubmit={onSubmit}>
      {/* Form fields using form.handleChange and form.values */}
    </form>
  )
}
```

## Production Checklist

### Form Security
- [ ] **Input Validation**: Both client and server-side validation implemented
- [ ] **CSRF Protection**: Consider implementing CSRF tokens for sensitive forms
- [ ] **Rate Limiting**: Prevent form spam and abuse
- [ ] **File Upload Security**: Validate file types, sizes, and scan for malware

### User Experience
- [ ] **Loading States**: Show loading indicators during form submission
- [ ] **Error Handling**: Clear, actionable error messages
- [ ] **Success Feedback**: Confirm successful form submissions
- [ ] **Form Persistence**: Save form data during navigation (when appropriate)

### Performance
- [ ] **Debounced Validation**: Avoid excessive validation calls
- [ ] **Optimistic Updates**: Show immediate feedback when possible
- [ ] **Form Reset**: Clear sensitive data after submission
- [ ] **File Size Limits**: Prevent large file uploads from blocking the UI

## Common Problems

### Problem: Form submits multiple times

**Cause**: Missing disabled state or event handling issues.

**Solution**:
```tsx
// ❌ Can submit multiple times
<button type="submit">Submit</button>

// ✅ Prevents multiple submissions
<button type="submit" disabled={submitting}>
  {submitting ? 'Submitting...' : 'Submit'}
</button>
```

### Problem: File uploads not working with server functions

**Cause**: Incorrect data handling or missing File validation.

**Solution**:
```typescript
// ✅ Proper file handling
const schema = z.object({
  file: z.instanceof(File)
})

export const uploadFile = createServerFn()
  .validator(schema)
  .handler(async ({ data }) => {
    const { file } = data
    // Process the File object
  })
```

### Problem: Form validation out of sync

**Cause**: Client and server validation schemas differ.

**Solution**:
```typescript
// ✅ Shared validation schema
// shared/schemas.ts
export const ContactFormSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10)
})

// Use same schema on client and server
import { ContactFormSchema } from '../shared/schemas'
```

## Related Resources

- [Create Basic Server Functions](./create-basic-server-functions.md) - Foundation concepts
- [Write Type-Safe Server Functions](./write-type-safe-server-functions.md) - Advanced TypeScript patterns
- [Zod Validation Documentation](https://zod.dev/)
- [HTML Form Validation](https://developer.mozilla.org/en-US/docs/Learn/Forms/Form_validation)