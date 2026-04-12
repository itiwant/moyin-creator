// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.

/**
 * PropsLibrary - Thư viện đạo cụ主góc nhìn
 * Cây thư mục bên trái + 右侧Đạo cụ网格，Hỗ trợTùy chỉnhthư mụcQuản lý
 */

import { useState, useRef } from 'react';
import { usePropsLibraryStore, PropItem, PropFolder } from '@/stores/props-library-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Package,
  MoveRight,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { useResolvedImageUrl } from '@/hooks/use-resolved-image-url';

// ── PropCard con组件 ──────────────────────────────────────────────────────────

function PropCard({ item }: { item: PropItem }) {
  const { deleteProp, renameProp, moveProp, folders } = usePropsLibraryStore();
  const resolvedUrl = useResolvedImageUrl(item.imageUrl);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(item.name);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  const handleRenameConfirm = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    renameProp(item.id, trimmed);
    setRenaming(false);
  };

  return (
    <>
      <div className="group relative flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors">
        {/* Khu vực ảnh */}
        <div className="aspect-square bg-muted relative overflow-hidden">
          {resolvedUrl ? (
            <img
              src={resolvedUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-8 h-8 text-muted-foreground/40" />
            </div>
          )}
          {/* Menu thao tác khi di chuột */}
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-md shadow-md"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => { setNameInput(item.name); setRenaming(true); }}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Đổi tên
                </DropdownMenuItem>
                {/* Di chuyển đếnthư mục */}
                {folders.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground py-1">
                      Di chuyển đếnthư mục
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => moveProp(item.id, null)}
                      className={cn(item.folderId === null && 'text-primary')}
                    >
                      <Layers className="mr-2 h-3.5 w-3.5" />
                      Thư mục gốc
                    </DropdownMenuItem>
                    {folders.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        onClick={() => moveProp(item.id, f.id)}
                        className={cn(item.folderId === f.id && 'text-primary')}
                      >
                        <MoveRight className="mr-2 h-3.5 w-3.5" />
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteAlert(true)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Xóa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Khu vực tên */}
        <div className="px-2 py-1.5">
          {renaming ? (
            <Input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleRenameConfirm}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConfirm();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="h-6 text-xs px-1 py-0"
            />
          ) : (
            <p
              className="text-xs text-foreground truncate cursor-default"
              onDoubleClick={() => { setNameInput(item.name); setRenaming(true); }}
              title={item.name}
            >
              {item.name}
            </p>
          )}
        </div>
      </div>

      {/* XóaXác nhận */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>XóaĐạo cụ</AlertDialogTitle>
            <AlertDialogDescription>
              Xác nhận xóa「{item.name}」？Hành động này không thể hoàn tác。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteProp(item.id);
                toast.success(`đã xóa「${item.name}」`);
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── FolderItem con组件 ────────────────────────────────────────────────────────

function FolderItem({
  folder,
  isActive,
  onClick,
}: {
  folder: PropFolder;
  isActive: boolean;
  onClick: () => void;
}) {
  const { renameFolder, deleteFolder, setSelectedFolderId } = usePropsLibraryStore();
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(folder.name);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  const handleRenameConfirm = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    renameFolder(folder.id, trimmed);
    setRenaming(false);
  };

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs cursor-pointer transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
        onClick={onClick}
      >
        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
        {renaming ? (
          <Input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleRenameConfirm}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="h-5 text-xs px-1 py-0 flex-1"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}

        {/* Nút thao tác thư mục (hiện khi di chuột) */}
        {!renaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setNameInput(folder.name);
                  setRenaming(true);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Đổi tên
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteAlert(true);
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Xóathư mục
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Xóathư mụcXác nhận */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóathư mục</AlertDialogTitle>
            <AlertDialogDescription>
              Xác nhận xóa thư mục「{folder.name}」? Các đạo cụ trong thư mục sẽ được chuyển về Thư mục gốc, không bị xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteFolder(folder.id);
                setSelectedFolderId('all');
                toast.success(`thư mục「${folder.name}」đã xóa`);
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Tạo mớithư mục弹窗 ──────────────────────────────────────────────────────────────

function NewFolderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addFolder, setSelectedFolderId } = usePropsLibraryStore();
  const [name, setName] = useState('');

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folder = addFolder(trimmed);
    setSelectedFolderId(folder.id);
    setName('');
    onOpenChange(false);
    toast.success(`Thư mục「${trimmed}」đã tạo`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>Tạo mớithư mục</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            autoFocus
            placeholder="Nhập tên thư mục... ví dụ: xe hơi, vũ khí..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onOpenChange(false);
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            Tạo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PropsLibrary 主组件 ───────────────────────────────────────────────────────

export function PropsLibrary() {
  const {
    items,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    getPropsByFolder,
  } = usePropsLibraryStore();

  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const visibleItems = getPropsByFolder(selectedFolderId);
  const currentFolderName =
    selectedFolderId === 'all'
      ? 'Tất cả đạo cụ'
      : folders.find((f) => f.id === selectedFolderId)?.name ?? 'Tất cả đạo cụ';

  return (
    <div className="h-full flex">
      {/* ── Cây thư mục bên trái ── */}
      <div className="w-[160px] shrink-0 border-r border-border flex flex-col bg-panel">
        {/* Tiêu đề cây thư mục */}
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">thư mục</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => setNewFolderOpen(true)}
            title="Tạo mớithư mục"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Danh sách thư mục */}
        <ScrollArea className="flex-1 py-1.5 px-1.5">
          {/* Tất cả đạo cụ */}
          <button
            className={cn(
              'flex items-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs transition-colors',
              selectedFolderId === 'all'
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            onClick={() => setSelectedFolderId('all')}
          >
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Tất cả đạo cụ</span>
            <span className="ml-auto text-[10px] opacity-60">{items.length}</span>
          </button>

          {/* 用户Tùy chỉnhthư mục */}
          {folders.map((folder) => {
            const count = items.filter((i) => i.folderId === folder.id).length;
            return (
              <div key={folder.id} className="relative">
                <FolderItem
                  folder={folder}
                  isActive={selectedFolderId === folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                />
                <span className="absolute right-7 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                  {count}
                </span>
              </div>
            );
          })}

          {/* 无thư mụcGợi ý */}
          {folders.length === 0 && (
            <p className="text-[10px] text-muted-foreground px-3 py-2 leading-relaxed">
              Nhấp右上角 + Tạo thư mục mới
            </p>
          )}
        </ScrollArea>

        {/* 底部Tạo mớinút */}
        <div className="p-2 border-t border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-7"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
            Tạo mớithư mục
          </Button>
        </div>
      </div>

      {/* ── 右侧Đạo cụ网格 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 面包屑/tiêu đề栏 */}
        <div className="px-4 py-2.5 border-b border-border shrink-0 flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{currentFolderName}</span>
          <span className="text-xs text-muted-foreground">({visibleItems.length} Đạo cụ)</span>
        </div>

        {/* Đạo cụ网格 */}
        <ScrollArea className="flex-1">
          {visibleItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground py-24">
              <Package className="h-16 w-16 opacity-20" />
              <div className="text-center">
                <p className="text-base font-medium">Thư viện đạo cụ为空</p>
                <p className="text-sm mt-1">
                  在「Tự do」panel的Studio Tạo ảnh ảnh后，<br />
                  Nhấp「Lưu vào Thư viện đạo cụ」即可ThêmĐạo cụ
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
              {visibleItems.map((item) => (
                <PropCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Tạo mớithư mục弹窗 */}
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} />
    </div>
  );
}
