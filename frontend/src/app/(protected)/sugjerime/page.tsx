'use client';

import { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { treatmentsApi, complaintsApi, suggestedConditionsApi } from '@/lib/api';
import { getSymptomLabel, extractList } from '@/lib/utils';
import { useSuggestedConditions } from '@/hooks/use-suggested-conditions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Stethoscope, Loader2, RefreshCcw, Plus, Edit, Trash2, CheckCircle2, Link2, Tag } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Old enum-based symptom suggestion tool (kept as-is) ──────────────────────

const SYMPTOMS = [
  'NECK_PAIN', 'LOWER_BACK_PAIN', 'SHOULDER_PAIN', 'KNEE_PAIN',
  'LEG_NUMBNESS', 'ARM_NUMBNESS', 'LIMITED_MOBILITY', 'MUSCLE_WEAKNESS',
] as const;
type Symptom = typeof SYMPTOMS[number];

function SymptomSuggestionTool() {
  const [selectedSymptoms, setSelectedSymptoms] = useState<Symptom[]>([]);

  const fetchSuggestions = useCallback(async () => {
    const res: any = await treatmentsApi.getSuggestions(selectedSymptoms);
    return res?.data?.conditions || [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymptoms]);

  // Same "Merr sugjerime" interaction the "Kontrollë e re" dialog uses for
  // its "Ankesat kryesore" → "Gjendjet e sugjeruara" flow.
  const { loading, results, fetch, reset } = useSuggestedConditions(fetchSuggestions);

  const toggleSymptom = (s: Symptom) => {
    setSelectedSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    reset();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Zgjidh Simptomat</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {SYMPTOMS.map((symptom) => {
              const isSelected = selectedSymptoms.includes(symptom);
              return (
                <button
                  key={symptom}
                  onClick={() => toggleSymptom(symptom)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all duration-150 text-sm',
                    isSelected
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300'
                      : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50',
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center',
                    isSelected ? 'border-teal-500 bg-teal-500' : 'border-muted-foreground',
                  )}>
                    {isSelected && <span className="text-white text-[10px]">✓</span>}
                  </div>
                  {getSymptomLabel(symptom)}
                </button>
              );
            })}
          </div>
          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => selectedSymptoms.length && fetch()}
              disabled={!selectedSymptoms.length || loading}
              className="gradient-teal text-white border-0 flex-1"
            >
              {loading && <Loader2 size={14} className="mr-2 animate-spin" />}
              {loading ? 'Duke marrë sugjerimet...' : `Merr sugjerime (${selectedSymptoms.length} simptoma)`}
            </Button>
            {selectedSymptoms.length > 0 && (
              <Button variant="outline" onClick={() => { setSelectedSymptoms([]); reset(); }}>
                <RefreshCcw size={14} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      {!loading && results !== null && (
        <Card className="border-teal-200 dark:border-teal-800">
          <CardHeader><CardTitle className="text-base text-teal-700 dark:text-teal-300">Patologjitë e sugjeruara</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {results.length > 0 ? (
              <div className="space-y-2">
                {results.map((condition, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-teal-50 dark:bg-teal-950 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <span className="text-sm font-medium">{condition}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nuk u gjet asnjë patologji e sugjeruar</p>
            )}
            <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Simptomat:</span>
              {selectedSymptoms.map((s) => <Badge key={s} variant="outline" className="text-xs">{getSymptomLabel(s)}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Admin: Gjendjet e sugjeruara management ──────────────────────────────────

interface ConditionFormState {
  id?: string;
  name: string;
  description: string;
}

const EMPTY_CONDITION_FORM: ConditionFormState = { name: '', description: '' };

function SuggestedConditionsAdmin() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formState, setFormState] = useState<ConditionFormState>(EMPTY_CONDITION_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['suggested-conditions'],
    queryFn: () => suggestedConditionsApi.getAll(),
  });
  const conditions = extractList<{ id: string; name: string; description?: string; isActive: boolean }>(data);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['suggested-conditions'] });
    // A condition's name/active state can affect what "Merr sugjerime" shows
    queryClient.invalidateQueries({ queryKey: ['complaints'] });
  };

  const createMutation = useMutation({
    mutationFn: (d: ConditionFormState) => suggestedConditionsApi.create({ name: d.name.trim(), description: d.description.trim() || undefined }),
    onSuccess: () => { invalidate(); setDialogOpen(false); toast.success('Patologjia u shtua!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (d: ConditionFormState) => suggestedConditionsApi.update(d.id!, { name: d.name.trim(), description: d.description.trim() || undefined }),
    onSuccess: () => { invalidate(); setDialogOpen(false); toast.success('Patologjia u përditësua!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => suggestedConditionsApi.update(id, { isActive }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => suggestedConditionsApi.delete(id),
    onSuccess: () => { invalidate(); toast.success('Patologjia u fshi!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setFormState(EMPTY_CONDITION_FORM); setDialogOpen(true); };
  const openEdit = (c: any) => { setFormState({ id: c.id, name: c.name, description: c.description || '' }); setDialogOpen(true); };
  const handleSubmit = () => {
    if (!formState.name.trim()) return toast.error('Emri është i detyrueshëm');
    if (formState.id) updateMutation.mutate(formState);
    else createMutation.mutate(formState);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Menaxho patologjitë/diagnozat që mund të sugjerohen</p>
        <Button onClick={openCreate} size="sm" className="gradient-teal text-white border-0 gap-2">
          <Plus size={14} /> Shto patologji
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Duke ngarkuar...</div>
      ) : conditions.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border rounded-xl">
          Nuk ka patologji. Shto patologjinë e parë.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {conditions.map((c) => (
            <div key={c.id} className={cn('flex items-center gap-1.5 border rounded-full pl-3 pr-1 py-1 transition-opacity', !c.isActive && 'opacity-50')}>
              <span className="text-sm">{c.name}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })} title={c.isActive ? 'Çaktivizo' : 'Aktivizo'}>
                <CheckCircle2 size={12} className={c.isActive ? 'text-teal-600' : 'text-muted-foreground'} />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(c)}><Edit size={12} /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formState.id ? 'Ndrysho patologjinë' : 'Shto patologji të re'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Emri i patologjisë *</label>
              <Input
                value={formState.name}
                onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                placeholder="Gonarthrosis"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Përshkrimi (opsional)</label>
              <Input
                value={formState.description}
                onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                placeholder="Përshkrim i shkurtër"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Anulo</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="gradient-teal text-white border-0">
              {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {formState.id ? 'Ruaj' : 'Shto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Admin: Ankesat kryesore + mapping management ─────────────────────────────

const COMPLAINT_CATEGORIES = [
  { id: 'CERVIKALE',    label: 'Cervikale' },
  { id: 'TORAKALE',     label: 'Torakale' },
  { id: 'LOMBOSAKRALE', label: 'Lombosakrale' },
  { id: 'KRAHU',        label: 'Krahu' },
  { id: 'BERRYLI',      label: 'Bërryli' },
  { id: 'KYCI',         label: 'Kyçi' },
  { id: 'KERDHOKULLA',  label: 'Kërdhokulla' },
  { id: 'GJURI',        label: 'Gjuri' },
  { id: 'SHPUTA',       label: 'Shputa' },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(COMPLAINT_CATEGORIES.map((c) => [c.id, c.label]));

interface ComplaintFormState {
  id?: string;
  name: string;
  description: string;
  category: string;
  suggestedConditionIds: string[];
}

const EMPTY_COMPLAINT_FORM: ComplaintFormState = { name: '', description: '', category: '', suggestedConditionIds: [] };

function ComplaintsAdmin() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formState, setFormState] = useState<ComplaintFormState>(EMPTY_COMPLAINT_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['complaints'],
    queryFn: () => complaintsApi.getAll(),
  });
  const complaints = extractList<{ id: string; name: string; description?: string; category?: string; suggestedConditions: { id: string; name: string }[]; isActive: boolean }>(data);

  const { data: conditionsData } = useQuery({
    queryKey: ['suggested-conditions', 'active'],
    queryFn: () => suggestedConditionsApi.getAll({ activeOnly: true }),
  });
  const conditionOptions = extractList<{ id: string; name: string }>(conditionsData);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['complaints'] });
  };

  const createMutation = useMutation({
    mutationFn: (d: ComplaintFormState) => complaintsApi.create({
      name: d.name.trim(),
      description: d.description.trim() || undefined,
      category: d.category || undefined,
      suggestedConditionIds: d.suggestedConditionIds,
    }),
    onSuccess: () => { invalidate(); setDialogOpen(false); toast.success('Ankesa u shtua!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (d: ComplaintFormState) => complaintsApi.update(d.id!, {
      name: d.name.trim(),
      description: d.description.trim() || undefined,
      category: d.category || undefined,
      suggestedConditionIds: d.suggestedConditionIds,
    }),
    onSuccess: () => { invalidate(); setDialogOpen(false); toast.success('Ankesa u përditësua!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => complaintsApi.update(id, { isActive }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => complaintsApi.delete(id),
    onSuccess: () => { invalidate(); toast.success('Ankesa u fshi!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setFormState(EMPTY_COMPLAINT_FORM); setDialogOpen(true); };
  const openEdit = (c: any) => {
    setFormState({
      id: c.id,
      name: c.name,
      description: c.description || '',
      category: c.category || '',
      suggestedConditionIds: (c.suggestedConditions || []).map((sc: { id: string }) => sc.id),
    });
    setDialogOpen(true);
  };
  const handleSubmit = () => {
    if (!formState.name.trim()) return toast.error('Emri është i detyrueshëm');
    if (formState.id) updateMutation.mutate(formState);
    else createMutation.mutate(formState);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Menaxho ankesat kryesore dhe lidhjen e tyre me patologjitë e sugjeruara</p>
        <Button onClick={openCreate} size="sm" className="gradient-teal text-white border-0 gap-2">
          <Plus size={14} /> Shto ankesë
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Duke ngarkuar...</div>
      ) : complaints.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border rounded-xl">
          Nuk ka ankesa. Shto ankesën e parë.
        </div>
      ) : (
        <div className="space-y-2">
          {complaints.map((c) => (
            <div key={c.id} className={cn('border rounded-xl p-3 flex items-start gap-3 transition-opacity', !c.isActive && 'opacity-50')}>
              <CheckCircle2 size={16} className={cn('mt-0.5 flex-shrink-0', c.isActive ? 'text-teal-500' : 'text-muted-foreground')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{c.name}</p>
                  {c.category && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-teal-700 border-teal-300 gap-1">
                      <Tag size={9} />{CATEGORY_LABEL[c.category] || c.category}
                    </Badge>
                  )}
                </div>
                {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                {c.suggestedConditions?.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.suggestedConditions.map((sc) => (
                      <Badge key={sc.id} variant="secondary" className="text-xs">{sc.name}</Badge>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1.5 text-amber-600">
                    <Link2 size={11} />
                    <span className="text-xs">Pa lidhje me gjendje — shto njërën që "Merr sugjerime" të mos jetë bosh</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })} title={c.isActive ? 'Çaktivizo' : 'Aktivizo'}>
                  <CheckCircle2 size={13} className={c.isActive ? 'text-teal-600' : 'text-muted-foreground'} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Edit size={13} /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formState.id ? 'Ndrysho ankesën' : 'Shto ankesë të re'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Rajoni anatomik</label>
              <Select
                value={formState.category || '_none_'}
                onValueChange={(v) => setFormState((s) => ({ ...s, category: v === '_none_' ? '' : v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Zgjidh kategorinë" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">Pa kategori</SelectItem>
                  {COMPLAINT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Emri i ankesës *</label>
              <Input
                value={formState.name}
                onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                placeholder="Dhimbje gjuri gjatë ecjes"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Përshkrimi (opsional)</label>
              <Input
                value={formState.description}
                onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                placeholder="Përshkrim i shkurtër"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Patologjitë e sugjeruara për këtë ankesë</label>
              {conditionOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1">Nuk ka patologji të krijuara ende — shtoji te seksioni "Patologjitë e sugjeruara" më sipër.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 mt-1 max-h-44 overflow-y-auto">
                  {conditionOptions.map((sc) => (
                    <div key={sc.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`map-${sc.id}`}
                        checked={formState.suggestedConditionIds.includes(sc.id)}
                        onCheckedChange={(checked) => {
                          setFormState((s) => ({
                            ...s,
                            suggestedConditionIds: checked
                              ? [...s.suggestedConditionIds, sc.id]
                              : s.suggestedConditionIds.filter((id) => id !== sc.id),
                          }));
                        }}
                      />
                      <label htmlFor={`map-${sc.id}`} className="text-sm cursor-pointer">{sc.name}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Anulo</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="gradient-teal text-white border-0">
              {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {formState.id ? 'Ruaj' : 'Shto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SuggestionsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === 'ADMIN';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Stethoscope className="text-teal-600" size={22} />
          Sugjerime
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sistemi i sugjerimeve dhe menaxhimi i ankesave kryesore
        </p>
      </div>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="font-semibold text-base">Patologjitë e sugjeruara</h2>
          <SuggestedConditionsAdmin />
        </section>
      )}

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="font-semibold text-base">Ankesat kryesore</h2>
          <ComplaintsAdmin />
        </section>
      )}

      {/* Legacy enum-based suggestions tool */}
      <SymptomSuggestionTool />
    </div>
  );
}
