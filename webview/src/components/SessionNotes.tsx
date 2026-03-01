import { useState, useEffect } from 'react';
import './SessionNotes.css';

interface Props {
  sessionId: string;
}

interface Note {
  id: string;
  content: string;
  timestamp: number;
  stepIndex?: number;
}

const SessionNotes = ({ sessionId }: Props) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Load notes from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`notes_${sessionId}`);
    if (stored) {
      try {
        setNotes(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse notes:', e);
      }
    }
  }, [sessionId]);

  // Save notes to localStorage
  const saveNotes = (updatedNotes: Note[]) => {
    localStorage.setItem(`notes_${sessionId}`, JSON.stringify(updatedNotes));
    setNotes(updatedNotes);
  };

  const addNote = () => {
    if (!newNote.trim()) return;

    const note: Note = {
      id: Date.now().toString(),
      content: newNote.trim(),
      timestamp: Date.now(),
    };

    saveNotes([...notes, note]);
    setNewNote('');
  };

  const deleteNote = (id: string) => {
    saveNotes(notes.filter(n => n.id !== id));
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`session-notes ${isExpanded ? 'expanded' : ''}`}>
      <button className="notes-toggle" onClick={() => setIsExpanded(!isExpanded)}>
        📝 Notes ({notes.length})
      </button>

      {isExpanded && (
        <div className="notes-panel">
          <div className="notes-header">
            <h3>Session Notes</h3>
            <p className="notes-subtitle">
              Add notes and observations about this session
            </p>
          </div>

          <div className="notes-input-section">
            <textarea
              className="notes-textarea"
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  addNote();
                }
              }}
            />
            <div className="notes-input-footer">
              <span className="notes-hint">Ctrl+Enter to save</span>
              <button
                className="notes-add-btn"
                onClick={addNote}
                disabled={!newNote.trim()}
              >
                Add Note
              </button>
            </div>
          </div>

          <div className="notes-list">
            {notes.length === 0 ? (
              <div className="notes-empty">
                <span className="empty-icon">📋</span>
                <p>No notes yet</p>
                <span className="empty-hint">Add your first note above</span>
              </div>
            ) : (
              notes.slice().reverse().map(note => (
                <div key={note.id} className="note-item">
                  <div className="note-content">{note.content}</div>
                  <div className="note-footer">
                    <span className="note-time">{formatTime(note.timestamp)}</span>
                    <button
                      className="note-delete"
                      onClick={() => deleteNote(note.id)}
                      title="Delete note"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionNotes;
