import React from "react";
import { CodexAuthSection } from "./CodexConfigSections";

interface CodexConfigEditorProps {
  authValue: string;
  onAuthChange: (value: string) => void;
  onAuthBlur?: () => void;
  authError: string;
}

const CodexConfigEditor: React.FC<CodexConfigEditorProps> = ({
  authValue,
  onAuthChange,
  onAuthBlur,
  authError,
}) => {
  return (
    <div className="space-y-6">
      <CodexAuthSection
        value={authValue}
        onChange={onAuthChange}
        onBlur={onAuthBlur}
        error={authError}
      />
    </div>
  );
};

export default CodexConfigEditor;
