import { BarChart3, Check, Copy, Edit, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppId } from "@/lib/api";

interface ProviderActionsProps {
  appId?: AppId;
  isCurrent: boolean;
  isInConfig?: boolean;
  isTesting?: boolean;
  isProxyTakeover?: boolean;
  isOmo?: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onTest?: () => void;
  onConfigureUsage?: () => void;
  onDelete: () => void;
  onRemoveFromConfig?: () => void;
  onDisableOmo?: () => void;
  onOpenTerminal?: () => void;
  isAutoFailoverEnabled?: boolean;
  isInFailoverQueue?: boolean;
  onToggleFailover?: (enabled: boolean) => void;
  isOfficialBlockedByProxy?: boolean;
  isReadOnly?: boolean;
  isDefaultModel?: boolean;
  onSetAsDefault?: () => void;
}

export function ProviderActions({
  isCurrent,
  onSwitch,
  onEdit,
  onDuplicate,
  onConfigureUsage,
  onDelete,
  isReadOnly = false,
}: ProviderActionsProps) {
  const { t } = useTranslation();
  const iconButtonClass = "h-8 w-8 p-1";
  const canDelete = !isReadOnly && !isCurrent;
  const readOnlyHint = t("provider.readOnly", {
    defaultValue: "此供应商只读",
  });

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant={isCurrent ? "secondary" : "default"}
        onClick={isCurrent ? undefined : onSwitch}
        disabled={isCurrent}
        className={cn(
          "w-[4.5rem] px-2.5",
          isCurrent &&
            "bg-gray-200 text-muted-foreground hover:bg-gray-200 hover:text-muted-foreground dark:bg-gray-700 dark:hover:bg-gray-700",
        )}
      >
        {isCurrent ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {isCurrent ? t("provider.inUse") : t("provider.enable")}
      </Button>

      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={isReadOnly ? undefined : onEdit}
          disabled={isReadOnly}
          title={isReadOnly ? readOnlyHint : t("common.edit")}
          className={cn(
            iconButtonClass,
            isReadOnly && "opacity-40 cursor-not-allowed text-muted-foreground",
          )}
        >
          <Edit className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={onDuplicate}
          title={t("provider.duplicate")}
          className={iconButtonClass}
        >
          <Copy className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={onConfigureUsage || undefined}
          title={t("provider.configureUsage", {
            defaultValue: "配置用量查询",
          })}
          className={cn(
            iconButtonClass,
            !onConfigureUsage &&
              "opacity-40 cursor-not-allowed text-muted-foreground",
          )}
        >
          <BarChart3 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={canDelete ? onDelete : undefined}
          title={isReadOnly ? readOnlyHint : t("common.delete")}
          className={cn(
            iconButtonClass,
            canDelete && "hover:text-red-500 dark:hover:text-red-400",
            !canDelete && "opacity-40 cursor-not-allowed text-muted-foreground",
          )}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
