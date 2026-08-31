import React, { useState } from 'react';
import MarkdownEditor from './MarkdownEditor';
import TableOfContents from './TableOfContents';

interface WikiContentProps {
  content?: string;
  title: string;
  isDarkMode: boolean;
  onSave?: (content: string) => void;
  editable?: boolean;
}

const WikiContent: React.FC<WikiContentProps> = ({
  content = '',
  title,
  isDarkMode,
  onSave,
  editable = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSave = () => {
    if (onSave) {
      onSave(editContent);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(content);
    setIsEditing(false);
  };



  if (!content && !editable) {
    return null;
  }

  return (
    <div className="wiki-content-section bg-white dark:bg-medical-surface rounded-xl p-6 card-depth border border-slate-200 dark:border-medical-line">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-medical-line">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h3 className="font-serif font-bold text-lg text-slate-800 dark:text-cyan-300">
            百科详细内容
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-medical-surfaceAlt px-2 py-1 rounded">
            Encyclopedia
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Expand/Collapse Button */}
          {content && !isEditing && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              title={isExpanded ? '收起' : '展开'}
            >
              <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Edit Button */}
          {editable && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1 rounded text-sm bg-medical-primary text-white hover:bg-medical-primaryDeep transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              编辑
            </button>
          )}

          {/* Save & Cancel Buttons (Edit Mode) */}
          {isEditing && (
            <>
              <button
                onClick={handleSave}
                className="px-3 py-1 rounded text-sm bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                保存
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1 rounded text-sm bg-slate-400 text-white hover:bg-slate-500 transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                取消
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      {isExpanded || isEditing ? (
        <div className={isExpanded && !isEditing ? 'animate-fade-in relative' : 'relative'}>
          {isExpanded && !isEditing && <TableOfContents content={content} />}
          {isEditing ? (
            <MarkdownEditor
              content={editContent}
              onChange={setEditContent}
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className="markdown-preview">
              <MarkdownEditor
                content={content}
                onChange={() => {}}
                isDarkMode={isDarkMode}
                readOnly={true}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-slate-400 dark:text-slate-500 mb-3">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="text-sm">
              {content ? '点击右上角展开按钮查看详细百科内容' : '暂无百科内容'}
            </p>
          </div>
          {editable && !content && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 rounded bg-medical-primary text-white hover:bg-medical-primaryDeep transition-colors"
            >
              添加百科内容
            </button>
          )}
        </div>
      )}

      {/* Tips */}
      {isEditing && (
        <div className="mt-4 p-3 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-800 rounded-lg">
          <div className="flex items-start gap-2 text-sm text-cyan-800 dark:text-cyan-300">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong>提示：</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>支持完整的 Markdown 语法，包括标题、列表、表格、代码块等</li>
                <li>可以插入图片和链接</li>
                <li>使用预览模式查看最终效果</li>
                <li>编辑完成后记得点击"保存"按钮</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WikiContent;
