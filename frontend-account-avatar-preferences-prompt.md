# Frontend Account Avatar And Preferences Prompt

Use this prompt in the frontend repo to wire account avatar and preferences in the existing settings UI with TanStack Query/React Query.

## Backend Routes

Use the existing API client conventions. These account routes are under `/api/me` and require auth cookies:

```txt
PATCH  /api/me/avatar
DELETE /api/me/avatar
PATCH  /api/me/preferences
```

Use `credentials: "include"` if the API wrapper does not already do this globally.

## Cloudinary Frontend Upload

Install the Cloudinary frontend dependency if the app does not already have it:

```bash
npm install cloudinary
```

The frontend env names are the backend names prefixed with `NEXT_PUBLIC_`, as required by Next.js.

Expected env values:

```env
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_API_KEY=
NEXT_PUBLIC_CLOUDINARY_API_SECRET=
```

Important security note: do not use `NEXT_PUBLIC_CLOUDINARY_API_SECRET` directly in browser upload code. Anything with `NEXT_PUBLIC_` is visible to users. Prefer an unsigned upload preset for browser uploads, or use the app's existing secure upload helper if one exists. If there is no upload helper yet, create a small Cloudinary upload utility using the unsigned upload endpoint and the public cloud name.

The backend does not receive the file. The frontend uploads the image to Cloudinary first, then sends the resulting secure URL to the backend.

Backend request:

```ts
PATCH /api/me/avatar
body: {
  avatar: string; // Cloudinary secure_url
}
```

Response:

```ts
{
  message: "Avatar updated successfully";
  user: User;
}
```

Delete avatar:

```ts
DELETE /api/me/avatar
```

Response:

```ts
{
  message: "Avatar deleted successfully";
  user: User;
}
```

The backend clears the avatar field and attempts to delete the old Cloudinary image.

## React Query Hooks

Create or update hooks:

```ts
useUpdateAvatarMutation()
useDeleteAvatarMutation()
useUpdatePreferencesMutation()
```

All successful mutations must invalidate the current user query so the avatar/preferences update across the app:

```ts
queryClient.invalidateQueries({ queryKey: userKeys.me() });
```

Use the actual current-user query key/helper if it already exists.

Use toasts for success and error messages.

## Avatar UI

In account/profile settings:

- show current avatar
- add change image button
- add delete/remove avatar option
- show loading state while image upload or backend mutation is pending
- disable duplicate submissions while pending

Flow for changing avatar:

1. User picks an image.
2. Validate client-side:
   - must be an image
   - reasonable size limit based on existing app conventions
3. Upload file to Cloudinary from the frontend.
4. Read Cloudinary `secure_url`.
5. Call `PATCH /api/me/avatar` with `{ avatar: secure_url }`.
6. Show success toast.
7. Invalidate current user query.

Flow for deleting avatar:

1. User clicks remove/delete avatar.
2. Confirm the action if the app normally confirms destructive profile actions.
3. Call `DELETE /api/me/avatar`.
4. Show success toast.
5. Invalidate current user query.

## Preferences UI

In the preferences/settings section, there is already a theme toggle and a `.dark` root class.

Implement three theme options:

```txt
System
Light
Dark
```

Behavior:

- `System`: follow system preference using `prefers-color-scheme`
- `Dark`: add `.dark` to the document root
- `Light`: remove `.dark` from the document root
- Persist the selected theme locally, for example in `localStorage`
- No backend API call is needed for theme yet

Add an OTP sign-in preference control:

```txt
OTP sign-in on login
```

This should call:

```ts
PATCH /api/me/preferences
body: {
  preferences: {
    twoFactorEnabled: boolean;
  }
}
```

Response:

```ts
{
  message: "Preferences updated successfully";
  user: User;
}
```

On success:

- show success toast
- invalidate current user query

On error:

- revert the toggle if using optimistic UI
- show error toast

## Types

Add or reuse these frontend types:

```ts
export type UpdateAvatarBody = {
  avatar: string;
};

export type UpdateAvatarResponse = {
  message: "Avatar updated successfully";
  user: User;
};

export type DeleteAvatarResponse = {
  message: "Avatar deleted successfully";
  user: User;
};

export type UpdatePreferencesBody = {
  preferences: {
    twoFactorEnabled?: boolean;
  };
};

export type UpdatePreferencesResponse = {
  message: "Preferences updated successfully";
  user: User;
};
```

Ensure the shared `User` type includes:

```ts
preferences: {
  twoFactorEnabled: boolean;
};
```

## Acceptance Criteria

- User can upload a profile image to Cloudinary from the frontend.
- Frontend sends the Cloudinary URL to `PATCH /api/me/avatar`.
- User can delete/remove profile picture with `DELETE /api/me/avatar`.
- Current user query is invalidated after avatar/preference changes.
- Preferences section includes OTP sign-in toggle wired to backend.
- Preferences section includes System/Light/Dark theme selection using `.dark` root class.
- Theme selection does not call the backend yet.
- Toasts are used for all success and error messages.
