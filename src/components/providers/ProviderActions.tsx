import { Check, Copy, Edit, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProviderActionsProps {
  isCurrent: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function ProviderActions({
  isCurrent,
  onSwitch,
  onEdit,
  onDuplicate,
  onDelete,
}: ProviderActionsProps) {
  const { t } = useTranslation();
  const iconButtonClass = "h-8 w-8 p-1";
  const canDelete = !isCurrent;

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant={isCurrent ? "secondary" : "default"}
        onClick={onSwitch}
        disabled={isCurrent}
        className={cn(
          "w-[4.5rem] px-2.5",
          isCurrent &&
            "bg-gray-200 text-muted-foreground hover:bg-gray-200 hover:text-muted-foreground dark:bg-gray-700 dark:hover:bg-gray-700",
        )}
      >
        {isCurrent ? (
          <Check className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {isCurrent
          ? t("provider.inUse", { defaultValue: "已启用" })
          : t("provider.enable", { defaultValue: "启用" })}
      </Button>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClass}
          onClick={onEdit}
          title={t("provider.edit", { defaultValue: "编辑" })}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClass}
          onClick={onDuplicate}
          title={t("provider.duplicate", { defaultValue: "复制" })}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            iconButtonClass,
            canDelete && "hover:text-red-500 dark:hover:text-red-400",
            !canDelete && "opacity-40 cursor-not-allowed text-muted-foreground",
          )}
          onClick={canDelete ? onDelete : undefined}
          disabled={!canDelete}
          title={t("provider.delete", { defaultValue: "删除" })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
