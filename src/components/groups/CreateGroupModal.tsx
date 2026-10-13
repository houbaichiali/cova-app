"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ open, onClose }: CreateGroupModalProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

  function close() {
    setName("");
    setDescription("");
    setErrors({});
    onClose();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (name.trim().length < 3) found.name = "Give your group a name of at least 3 characters.";
    if (description.trim().length < 10)
      found.description = "Describe the group in at least 10 characters.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    toast.push(`"${name.trim()}" is ready to go once groups are saved by a backend`);
    close();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create a group"
      description="Start a study or project group for your classmates."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          id="group-name"
          label="Group name"
          value={name}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextAreaField
          id="group-description"
          label="What is this group for?"
          value={description}
          error={errors.description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <DemoNotice>
          Demo only: new groups are validated but not saved, because there is no backend yet.
        </DemoNotice>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">Create group</Button>
        </div>
      </form>
    </Modal>
  );
}
