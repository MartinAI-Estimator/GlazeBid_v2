import React from 'react';
import { 
  Home, 
  Building2, 
  HardHat, 
  FileText, 
  Folder,
  ChevronRight,
  Settings,
  Save,
  Upload
} from 'lucide-react';

/**
 * WorkflowSidebar
 * 
 * Persistent sidebar visible on all pages (Home, Drawing Viewer, Document Viewer).
 * Shows project navigation with 4 main categories.
 */
const WorkflowSidebar = ({ 
  project,
  currentView,
  projectData,
  onNavigate,
  onSaveProject,
  onLoadProject
}) => {
  // Category definitions with icons and colors
  const categories = [
    {
      id: 'home',
      name: 'Project Home',
      icon: Home,
      color: '#60a5fa',
      view: 'projectHome'
    },
    {
      id: 'architectural',
      name: 'Architectural',
      icon: Building2,
      color: '#10B981',
      count: projectData?.architecturalCount || 0,
      view: 'pdfViewer',
      viewerType: 'drawing',
      category: 'architectural'
    },
    {
      id: 'structural',
      name: 'Structural',
      icon: HardHat,
      color: '#F59E0B',
      count: projectData?.structuralCount || 0,
      view: 'pdfViewer',
      viewerType: 'drawing',
      category: 'structural'
    },
    {
      id: 'specifications',
      name: 'Specifications',
      icon: FileText,
      color: '#8B5CF6',
      count: projectData?.specsCount || 0,
      view: 'documentViewer',
      viewerType: 'document',
      category: 'specifications'
    },
    {
      id: 'other',
      name: 'Other Documents',
      icon: Folder,
      color: '#6B7280',
      count: projectData?.otherCount || 0,
      view: 'pdfViewer',
      viewerType: 'drawing',
      category: 'other'
    }
  ];

  const handleCategoryClick = (category) => {
    if (onNavigate) {
      onNavigate({
        view: category.view,
        viewerType: category.viewerType,
        category: category.category
      });
    }
  };

  // Determine if a category is active
  const isActive = (categoryId) => {
    if (categoryId === 'home' && currentView === 'projectHome') return true;
    // Add more conditions based on current view state
    return false;
  };

  return (
    <div style={styles.sidebar}>
      {/* Project Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoText}>GlazeBid</span>
          <span style={styles.logoAiq}>Builder</span>
        </div>
        {project && (
          <div style={styles.projectName} title={project}>
            {project}
          </div>
        )}
      </div>

      {/* Navigation Categories */}
      <nav style={styles.nav}>
        <div style={styles.sectionLabel}>NAVIGATION</div>
        
        {categories.map((category) => {
          const Icon = category.icon;
          const active = isActive(category.id);
          
          return (
            <button
              key={category.id}
              onClick={() => handleCategoryClick(category)}
              style={{
                ...styles.navItem,
                backgroundColor: active ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                borderLeft: active ? '3px solid #3B82F6' : '3px solid transparent',
              }}
            >
              <div style={styles.navItemLeft}>
                <Icon 
                  size={18} 
                  style={{ color: category.color }} 
                />
                <span style={styles.navItemText}>{category.name}</span>
              </div>
              <div style={styles.navItemRight}>
                {category.count !== undefined && category.count > 0 && (
                  <span style={{...styles.badge, backgroundColor: category.color}}>
                    {category.count}
                  </span>
                )}
                <ChevronRight size={16} style={styles.chevron} />
              </div>
            </button>
          );
        })}
      </nav>

      {/* Project Actions */}
      <div style={styles.actions}>
        <div style={styles.sectionLabel}>PROJECT</div>
        
        <button onClick={onSaveProject} style={styles.actionButton}>
          <Save size={16} />
          <span>Save Project (.aiq)</span>
        </button>
        
        <button onClick={onLoadProject} style={styles.actionButton}>
          <Upload size={16} />
          <span>Load Project</span>
        </button>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <button style={styles.settingsButton}>
          <Settings size={16} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};

const styles = {
  sidebar: {
    width: '240px',
    minWidth: '240px',
    backgroundColor: '#060f1c',
    borderRight: '1px solid #1d3a5f',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #1d3a5f',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '8px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#007BFF',
  },
  logoAiq: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#007BFF',
  },
  projectName: {
    fontSize: '12px',
    color: '#9ca3af',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nav: {
    flex: 1,
    padding: '12px 8px',
    overflowY: 'auto',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#6b7280',
    letterSpacing: '0.5px',
    padding: '8px 12px 4px',
    textTransform: 'uppercase',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginBottom: '2px',
    transition: 'all 0.15s ease',
  },
  navItemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  navItemText: {
    fontSize: '13px',
    color: '#e5e7eb',
    fontWeight: 500,
  },
  navItemRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '10px',
    minWidth: '20px',
    textAlign: 'center',
  },
  chevron: {
    color: '#6b7280',
  },
  actions: {
    padding: '12px 8px',
    borderTop: '1px solid #1d3a5f',
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#9ca3af',
    fontSize: '13px',
    marginBottom: '2px',
    transition: 'all 0.15s ease',
  },
  footer: {
    padding: '12px 8px',
    borderTop: '1px solid #1d3a5f',
  },
  settingsButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#6b7280',
    fontSize: '13px',
    transition: 'all 0.15s ease',
  },
};

export default WorkflowSidebar;
