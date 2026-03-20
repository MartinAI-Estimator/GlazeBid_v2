import { useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { useProject } from '../context/ProjectContext';

/**
 * useProjectPersistence Hook
 * Handles Save/Load operations for GlazeBid projects
 * 
 * Features:
 * - saveProject: Save current state to Supabase
 * - loadProject: Restore a saved project
 * - fetchProjects: Get list of all projects
 * - deleteProject: Remove a project
 */
const useProjectPersistence = () => {
  const {
    markups,
    setMarkups,
    importedItems,
    setImportedItems,
    globalSettings,
    setGlobalSettings,
    adminSettings,
    setAdminSettings,
    bidSettings,
    setBidSettings
  } = useProject();

  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentProjectName, setCurrentProjectName] = useState('Untitled Project');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Save Project
   * Creates a new project or updates existing one
   */
  const saveProject = useCallback(async (projectName, status = 'Draft') => {
    if (!isSupabaseConfigured()) {
      setError('Supabase not configured. Check your environment variables.');
      return null;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Step 1: Create or Update Project record
      let projectId = currentProjectId;
      
      if (projectId) {
        // Update existing project
        const { error: updateError } = await supabase
          .from('projects')
          .update({
            name: projectName,
            status: status,
            updated_at: new Date().toISOString()
          })
          .eq('id', projectId);

        if (updateError) throw updateError;
      } else {
        // Create new project
        const { data: newProject, error: insertError } = await supabase
          .from('projects')
          .insert([
            {
              name: projectName,
              status: status
            }
          ])
          .select()
          .single();

        if (insertError) throw insertError;
        projectId = newProject.id;
        setCurrentProjectId(projectId);
      }

      // Step 2: Save Markups (Delete old ones first to avoid duplicates)
      await supabase
        .from('project_markups')
        .delete()
        .eq('project_id', projectId);

      if (markups.length > 0) {
        const { error: markupsError } = await supabase
          .from('project_markups')
          .insert(
            markups.map(markup => ({
              project_id: projectId,
              data: markup
            }))
          );

        if (markupsError) throw markupsError;
      }

      // Step 3: Save Settings (Upsert - update if exists, insert if not)
      const { error: settingsError } = await supabase
        .from('project_settings')
        .upsert([
          {
            project_id: projectId,
            global_settings: globalSettings,
            admin_settings: adminSettings,
            bid_inputs: {
              ...bidSettings,
              imported_items: importedItems // Save imported items with bid settings
            }
          }
        ], {
          onConflict: 'project_id'
        });

      if (settingsError) throw settingsError;

      setCurrentProjectName(projectName);
      console.log('✅ Project saved successfully:', projectName);
      return projectId;

    } catch (err) {
      console.error('❌ Save error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, markups, importedItems, globalSettings, adminSettings, bidSettings]);

  /**
   * Load Project
   * Restores a saved project into the current session
   */
  const loadProject = useCallback(async (projectId) => {
    if (!isSupabaseConfigured()) {
      setError('Supabase not configured. Check your environment variables.');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Load Project Info
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;

      // Step 2: Load Markups
      const { data: markupsData, error: markupsError } = await supabase
        .from('project_markups')
        .select('data')
        .eq('project_id', projectId);

      if (markupsError) throw markupsError;

      // Step 3: Load Settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('project_settings')
        .select('*')
        .eq('project_id', projectId)
        .single();

      if (settingsError && settingsError.code !== 'PGRST116') { // Ignore "no rows" error
        throw settingsError;
      }

      // Step 4: Restore State to Context
      const restoredMarkups = markupsData?.map(m => m.data) || [];
      console.log('📂 Loaded', restoredMarkups.length, 'markups from project', project.name);
      
      setMarkups(restoredMarkups);
      
      if (settingsData) {
        if (settingsData.global_settings) {
          setGlobalSettings(settingsData.global_settings);
        }
        if (settingsData.admin_settings) {
          setAdminSettings(settingsData.admin_settings);
        }
        if (settingsData.bid_inputs) {
          const { imported_items, ...bidInputs } = settingsData.bid_inputs;
          setBidSettings(bidInputs);
          setImportedItems(imported_items || []);
        }
      }

      setCurrentProjectId(projectId);
      setCurrentProjectName(project.name);
      console.log('✅ Project loaded successfully:', project.name);
      return true;

    } catch (err) {
      console.error('❌ Load error:', err);
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setMarkups, setGlobalSettings, setAdminSettings, setBidSettings, setImportedItems]);

  /**
   * Fetch All Projects
   * Returns list of projects for the "Open" modal
   */
  const fetchProjects = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, created_at, updated_at')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data || [];

    } catch (err) {
      console.error('❌ Fetch error:', err);
      setError(err.message);
      return [];
    }
  }, []);

  /**
   * Delete Project
   * Removes a project and all associated data (cascade delete)
   */
  const deleteProject = useCallback(async (projectId) => {
    if (!isSupabaseConfigured()) {
      setError('Supabase not configured. Check your environment variables.');
      return false;
    }

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;

      // If deleting current project, clear the state
      if (projectId === currentProjectId) {
        setCurrentProjectId(null);
        setCurrentProjectName('Untitled Project');
      }

      console.log('✅ Project deleted successfully');
      return true;

    } catch (err) {
      console.error('❌ Delete error:', err);
      setError(err.message);
      return false;
    }
  }, [currentProjectId]);

  /**
   * Create New Project
   * Clears current state for a fresh start
   */
  const newProject = useCallback(() => {
    setMarkups([]);
    setImportedItems([]);
    setCurrentProjectId(null);
    setCurrentProjectName('Untitled Project');
    console.log('📄 New project created');
  }, [setMarkups, setImportedItems]);

  return {
    // State
    currentProjectId,
    currentProjectName,
    isSaving,
    isLoading,
    error,
    isConfigured: isSupabaseConfigured(),

    // Actions
    saveProject,
    loadProject,
    fetchProjects,
    deleteProject,
    newProject,
    
    // Helpers
    setCurrentProjectName
  };
};

export default useProjectPersistence;
