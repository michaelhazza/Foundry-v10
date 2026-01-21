import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  Upload,
  Settings,
  Play,
  Database,
  FileOutput,
  AlertCircle,
  Trash2,
  Edit,
} from 'lucide-react';

interface Project {
  id: number;
  name: string;
  description: string | null;
  targetSchema: string;
  status: string;
  dataSourceCount: number;
  datasetCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DataSource {
  id: number;
  name: string;
  type: string;
  format: string | null;
  status: string;
  recordCount: number | null;
  createdAt: string;
}

interface Dataset {
  id: number;
  name: string;
  format: string;
  recordCount: number;
  fileSize: number;
  createdAt: string;
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const canDelete = user?.role === 'admin';

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    try {
      const [projectRes, sourcesRes, datasetsRes] = await Promise.all([
        api.get<{ project: Project }>(`/projects/${id}`),
        api.get<DataSource[]>(`/projects/${id}/data-sources`),
        api.get<Dataset[]>(`/projects/${id}/datasets`),
      ]);

      setProject(projectRes.data?.project || null);
      setDataSources(sourcesRes.data || []);
      setDatasets(datasetsRes.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await api.delete(`/projects/${id}`);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || 'Project not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground">{project.description}</p>
            )}
          </div>
          <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
            {project.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={() => navigate(`/projects/${id}/edit`)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button onClick={() => navigate(`/projects/${id}/upload`)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Data
              </Button>
            </>
          )}
          {canDelete && (
            <Button variant="destructive" size="icon" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Data Sources</CardDescription>
            <CardTitle className="text-3xl">{project.dataSourceCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Datasets</CardDescription>
            <CardTitle className="text-3xl">{project.datasetCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Target Schema</CardDescription>
            <CardTitle className="text-lg capitalize">{project.targetSchema}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Created</CardDescription>
            <CardTitle className="text-sm">{formatDate(project.createdAt)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Data Sources */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Data Sources
            </CardTitle>
            <CardDescription>Source files and API connections</CardDescription>
          </div>
          {canEdit && dataSources.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/upload`)}>
              <Upload className="mr-2 h-4 w-4" />
              Add Source
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {dataSources.length === 0 ? (
            <div className="text-center py-8">
              <Database className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground mb-4">No data sources yet</p>
              {canEdit && (
                <Button onClick={() => navigate(`/projects/${id}/upload`)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Data
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {dataSources.map((source) => (
                <Link
                  key={source.id}
                  to={`/data-sources/${source.id}/preview`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                >
                  <div>
                    <p className="font-medium">{source.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {source.type} - {source.format || 'Unknown format'}
                      {source.recordCount && ` - ${source.recordCount.toLocaleString()} records`}
                    </p>
                  </div>
                  <Badge variant={source.status === 'ready' ? 'default' : 'secondary'}>
                    {source.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schema Mapping & Processing */}
      {dataSources.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Schema Mapping
              </CardTitle>
              <CardDescription>Configure how data is transformed</CardDescription>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <Button onClick={() => navigate(`/projects/${id}/schema`)} className="w-full">
                  Configure Mapping
                </Button>
              ) : (
                <Button variant="outline" onClick={() => navigate(`/projects/${id}/schema`)} className="w-full">
                  View Mapping
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Processing
              </CardTitle>
              <CardDescription>Start data processing jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <Button onClick={() => navigate(`/projects/${id}/process`)} className="w-full">
                  Start Processing
                </Button>
              ) : (
                <Button variant="outline" onClick={() => navigate(`/projects/${id}/process`)} className="w-full" disabled>
                  View Jobs
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Datasets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileOutput className="h-5 w-5" />
            Datasets
          </CardTitle>
          <CardDescription>Processed output datasets ready for download</CardDescription>
        </CardHeader>
        <CardContent>
          {datasets.length === 0 ? (
            <div className="text-center py-8">
              <FileOutput className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                No datasets yet. Process your data sources to create datasets.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {datasets.map((dataset) => (
                <Link
                  key={dataset.id}
                  to={`/datasets/${dataset.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                >
                  <div>
                    <p className="font-medium">{dataset.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {dataset.format.toUpperCase()} - {dataset.recordCount.toLocaleString()} records - {formatFileSize(dataset.fileSize)}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(dataset.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
