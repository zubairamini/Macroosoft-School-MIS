// Announcements & messages view — Phase 4: school/branch/section
// announcements with read status, publish gate, and the SMS/email message
// log (queued via the outbox; delivery is a production gateway away).

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Megaphone, Loader2, Plus, CheckCheck, MessageSquare, Search, Send } from "lucide-react";
import { useMe, useSections, useAnnouncements, useCreateAnnouncement, useAnnouncementAction, useMarkAnnouncementRead, useMessageLog, useSendMessage } from "@/lib/api/hooks";
import { EmptyState, TableSkeleton, Ltr, KpiCard, JalaliDateInput } from "@/components/shared";
import { faNum } from "@/lib/format";
import { hasGrant } from "@/app-shell/shell";
import { formatInstantJalaliDateTime } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api/hooks";
import { FinBadge, FinHeader } from "@/features/finance/shared";

const AUDIENCES = [
  { value: "all", label: "همه (کادر + اولیا)" },
  { value: "staff", label: "فقط کادر مکتب" },
  { value: "guardians", label: "فقط اولیا" },
];

export function AnnouncementsView() {
  const { data: me } = useMe();
  const canManage = hasGrant(me, "announcements.manage");
  const [tab, setTab] = useState("announcements");
  const { data: announcements } = useAnnouncements();
  const published = (announcements ?? []).filter((a) => a.status === "published");
  const unread = published.filter((a) => !a.readByMe).length;

  return (
    <div className="space-y-4">
      <FinHeader
        title="اعلانات و ارتباطات"
        subtitle="اعلانات شعبه با وضعیت خوانده‌شده/ناخوانده، و صف پیام‌های متنی/ایمیلی به اولیا و کادر."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="اعلانات منتشرشده" value={faNum(published.length)} icon={Megaphone} />
        <KpiCard label="ناخوانده توسط شما" value={faNum(unread)} icon={CheckCheck} tone="amber" />
        <KpiCard label="پیش‌نویس‌ها" value={faNum((announcements ?? []).length - published.length)} icon={Megaphone} tone="primary" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="announcements">اعلانات</TabsTrigger>
          {canManage ? <TabsTrigger value="messages">پیام‌ها (SMS/ایمیل)</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="announcements" className="mt-3">
          <AnnouncementsTab canManage={canManage} />
        </TabsContent>
        {canManage ? (
          <TabsContent value="messages" className="mt-3">
            <MessagesTab />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

// ── Announcements tab ───────────────────────────────────────────────────────

function AnnouncementsTab({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: announcements, isLoading } = useAnnouncements({
    status: status || undefined,
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          {canManage ? (
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="published">منتشرشده</SelectItem>
                <SelectItem value="draft">پیش‌نویس</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {canManage ? (
            <div className="ms-auto">
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> اعلان جدید
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={5} cols={5} /></div>
        ) : (announcements ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Megaphone}
              title="اعلانی وجود ندارد"
              body={canManage ? "اولین اعلان شعبه را بنویسید." : undefined}
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(announcements ?? []).map((a) => (
              <AnnouncementCard key={a.id} announcement={a} canManage={canManage} />
            ))}
          </div>
        )}
      </CardContent>

      {createOpen ? <CreateAnnouncementDialog open onOpenChange={setCreateOpen} /> : null}
    </Card>
  );
}

function AnnouncementCard({
  announcement,
  canManage,
}: {
  announcement: {
    id: string; title: string; body: string; status: string; statusLabel: string;
    audienceLabel: string; sectionLabel: string | null; branchName: string | null;
    publishedAt: string | null; createdAt: string; readCount: number; readByMe: boolean;
  };
  canManage: boolean;
}) {
  const action = useAnnouncementAction();
  const markRead = useMarkAnnouncementRead();
  const a = announcement;

  return (
    <div className={`px-4 py-4 ${a.status === "published" && !a.readByMe ? "bg-amber-50/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{a.title}</span>
        <FinBadge status={a.status === "published" ? "active" : "draft"} label={a.statusLabel} />
        <span className="text-xs text-muted-foreground">{a.audienceLabel}</span>
        {a.sectionLabel ? (
          <span className="text-xs text-muted-foreground">— {a.sectionLabel}</span>
        ) : null}
        {a.branchName ? <span className="text-xs text-muted-foreground">({a.branchName})</span> : null}
        <div className="ms-auto flex items-center gap-1">
          {canManage && a.status === "draft" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={action.isPending}
              onClick={async () => {
                try {
                  await action.mutateAsync({ id: a.id, action: "publish" });
                  toast.success("اعلان منتشر شد.");
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                }
              }}
            >
              انتشار
            </Button>
          ) : null}
          {canManage && a.status === "published" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={action.isPending}
              onClick={async () => {
                try {
                  await action.mutateAsync({ id: a.id, action: "unpublish" });
                  toast.success("اعلان از انتشار برداشته شد.");
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                }
              }}
            >
              برداشتن از انتشار
            </Button>
          ) : null}
          {a.status === "published" && !a.readByMe ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={markRead.isPending}
              onClick={async () => {
                try {
                  await markRead.mutateAsync(a.id);
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                }
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> خواندم
            </Button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-sm leading-7 text-foreground/90">{a.body}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {a.publishedAt ? formatInstantJalaliDateTime(a.publishedAt) : "—"} · خوانده‌شده توسط {faNum(a.readCount)} نفر
      </p>
    </div>
  );
}

function CreateAnnouncementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateAnnouncement();
  const { data: sections } = useSections();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [classSectionId, setClassSectionId] = useState("");

  const valid = title.trim().length >= 3 && body.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>اعلان جدید</DialogTitle>
          <DialogDescription>
            اعلان ابتدا به‌صورت پیش‌نویس ثبت می‌شود و با «انتشار» برای مخاطبان قابل‌مشاهده می‌گردد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>عنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: تعطیلی روز جمعه" />
          </div>
          <div className="space-y-1.5">
            <Label>متن اعلان</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>مخاطبان</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>شعبهٔ صنفی (اختیاری)</Label>
              <Select value={classSectionId || "none"} onValueChange={(v) => setClassSectionId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="کل شعبه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— کل شعبهٔ مکتب —</SelectItem>
                  {(sections ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  title: title.trim(),
                  body: body.trim(),
                  audience,
                  classSectionId: classSectionId || null,
                });
                toast.success("اعلان (پیش‌نویس) ثبت شد.");
                onOpenChange(false);
                setTitle(""); setBody(""); setAudience("all"); setClassSectionId("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Messages tab (SMS/email log) ────────────────────────────────────────────

function MessagesTab() {
  const [channel, setChannel] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const { data: messages, isLoading } = useMessageLog({ channel: channel || undefined });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Select value={channel || "all"} onValueChange={(v) => setChannel(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه کانال‌ها</SelectItem>
              <SelectItem value="sms">پیام متنی</SelectItem>
              <SelectItem value="email">ایمیل</SelectItem>
            </SelectContent>
          </Select>
          <div className="ms-auto">
            <Button onClick={() => setSendOpen(true)}>
              <Send className="h-4 w-4" /> ارسال پیام
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={5} /></div>
        ) : (messages ?? []).length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={MessageSquare}
              title="پیامی ثبت نشده است"
              body="پیام‌ها در صف ثبت می‌شوند؛ ارسال واقعی نیازمند وصل‌کردن درگاه SMS/ایمیل در مرحلهٔ نصب است."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کانال</TableHead>
                  <TableHead>گیرنده</TableHead>
                  <TableHead>متن</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>زمان ثبت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(messages ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.channelLabel}</TableCell>
                    <TableCell><Ltr className="text-xs">{m.recipient}</Ltr></TableCell>
                    <TableCell className="max-w-sm truncate text-muted-foreground" title={m.body}>{m.body}</TableCell>
                    <TableCell>
                      <FinBadge status={m.status === "sent" ? "active" : m.status === "queued" ? "draft" : "void"} label={m.statusLabel} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatInstantJalaliDateTime(m.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {sendOpen ? <SendMessageDialog open onOpenChange={setSendOpen} /> : null}
    </Card>
  );
}

function SendMessageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const send = useSendMessage();
  const { data: sections } = useSections();
  const [target, setTarget] = useState("guardians");
  const [channel, setChannel] = useState("sms");
  const [classSectionId, setClassSectionId] = useState("");
  const [body, setBody] = useState("");

  const valid = body.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ارسال پیام به گروه</DialogTitle>
          <DialogDescription>
            پیام برای هر مخاطب در صف ثبت می‌شود (MessageLog + صف رویدادها)؛ ارسال واقعی در نصب تولیدی با وصل‌کردن درگاه انجام می‌گیرد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>گیرندگان</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="guardians">اولیا (شماره‌های ثبت‌شده)</SelectItem>
                  <SelectItem value="staff">کادر مکتب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>کانال</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">پیام متنی</SelectItem>
                  <SelectItem value="email">ایمیل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {target === "guardians" ? (
            <div className="space-y-1.5">
              <Label>محدود به شعبهٔ صنفی (اختیاری)</Label>
              <Select value={classSectionId || "none"} onValueChange={(v) => setClassSectionId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="همه شاگردان شعبه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— همه شاگردان شعبه —</SelectItem>
                  {(sections ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>متن پیام</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="مثلاً: جلسهٔ اولیا روز سه‌شنبه ساعت ۱۰ صبح برگزار می‌شود." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>لغو</Button>
          <Button
            disabled={!valid || send.isPending}
            onClick={async () => {
              try {
                const res = await send.mutateAsync({
                  target,
                  channel,
                  classSectionId: target === "guardians" ? classSectionId || null : null,
                  body: body.trim(),
                });
                toast.success(`${faNum(res.queuedCount)} پیام در صف ثبت شد.`);
                onOpenChange(false);
                setBody(""); setClassSectionId("");
              } catch (err) {
                toast.error(apiErrorMessage(err));
              }
            }}
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ثبت در صف ارسال"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
