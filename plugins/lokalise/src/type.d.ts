declare module '@builder.io/app-context';

interface LokaliseProject {
  project_id: string;
  name: string;
  source_language_iso: string;
  project_languages: Array<{ lang_iso: string; description: string; }>;
  // Add other fields as needed
}

interface LokaliseContributor {
  user_id: number;
  email: string;
  fullname: string;
  // Permissions, etc.
}
