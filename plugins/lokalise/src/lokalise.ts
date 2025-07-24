export class LokaliseApi {
    private baseUrl = 'https://api.lokalise.com/api2';
    private headers: HeadersInit;
  
    constructor(private apiToken: string) {
      this.headers = {
        'X-Api-Token': apiToken,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      };
    }
  
    async getAllProjects() {
      const response = await fetch(`${this.baseUrl}/projects?limit=5000`, {
        method: 'GET',
        headers: this.headers,
      });
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    }
  
    async getProject(projectId: string) {
      const response = await fetch(`${this.baseUrl}/projects/${projectId}`, {
        method: 'GET',
        headers: this.headers,
      });
      if (!response.ok) throw new Error('Failed to fetch project');
      return response.json();
    }
  
    async getContributors(projectId: string) {
      const response = await fetch(`${this.baseUrl}/projects/${projectId}/contributors`, {
        method: 'GET',
        headers: this.headers,
      });
      if (!response.ok) throw new Error('Failed to fetch contributors');
      return response.json();
    }
  
    async uploadTranslationFile(options: { projectId: string, fileContent: string, filename: string, langIso: string, tags: string[], description: string }) {
      const body = {
        data: options.fileContent, // base64 encoded JSON
        filename: options.filename,
        lang_iso: options.langIso,
        tags: options.tags,
        description: options.description,
      };
      const response = await fetch(`${this.baseUrl}/projects/${options.projectId}/files/upload`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to upload file');
      const data = await response.json();
      return data.process_id; // Poll this
    }
  
    async pollUploadProcess(projectId: string, processId: string) {
      let status = 'queued';
      while (status !== 'completed' && status !== 'failed') {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2s
        const response = await fetch(`${this.baseUrl}/projects/${projectId}/processes/${processId}`, {
          method: 'GET',
          headers: this.headers,
        });
        if (!response.ok) throw new Error('Failed to poll process');
        const data = await response.json();
        status = data.status;
        if (status === 'failed') throw new Error('Upload failed');
      }
      return true;
    }
  
    async createTask(options: { projectId: string, title: string, description: string, keys: number[], languages: Array<{ lang_iso: string, users: number[] }> }) {
      const body = {
        title: options.title,
        description: options.description,
        keys: options.keys,
        languages: options.languages,
      };
      const response = await fetch(`${this.baseUrl}/projects/${options.projectId}/tasks`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to create task');
      return response.json();
    }
  
    async getKeys(projectId: string, options: { tags: string[] }) {
      const params = new URLSearchParams({ filter_tags: options.tags.join(',') });
      const response = await fetch(`${this.baseUrl}/projects/${projectId}/keys?${params}`, {
        method: 'GET',
        headers: this.headers,
      });
      if (!response.ok) throw new Error('Failed to fetch keys');
      return response.json();
    }
  
    async downloadTranslations(projectId: string, options: { languages: string[], tags: string[] }) {
      const body = {
        format: 'json',
        languages: options.languages,
        filter_tags: options.tags,
      };
      const response = await fetch(`${this.baseUrl}/projects/${projectId}/files/download`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to download translations');
      const data = await response.json();
      const bundleResponse = await fetch(data.bundle_url);
      return bundleResponse.json(); // Parse ZIP or handle as needed
    }
  
    // Implement other methods like updateTranslationFile (re-upload), removeContentFromJob (delete keys), createLocalJob (Builder-side), applyTranslation (map translations back), etc., similarly.
    // For brevity, expand as needed.
  }